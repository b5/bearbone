var Protocol = require('./Protocol')
  , Err = require('./Err')
  , db = require('ninjazord')
  , _ = require('underscore');

/* ------ * Sets * ------ */
// sets property must be an object with array values
// where the first value in the array is the param to sort
// the set by. 
// pass true after the param name to have the collection keep
// a set on the conditional existence of the param.
// if a second param is provided (and isn't a function), it's what the attribute needs to be to be added.
// pass a function after the param to have it evaluated against the object
// the function will receive one arg (the model object in question), and must return true or false.
// the function should be stored on the controller
// eg. sets : {
//    all : ['created'],
//    recent : ['updated'],
//    hidden : ['hidden', true]
//    attended : ['updated', hasAttended]
// }
var Sorting = Protocol.extend({
  name : "sorting",
  initialize : function (Target) {
    if (!Target.name) { throw "sorting protocol target object must have a name"; }
    this.sets = Target.sets || {};
  },
  sets: {},
  nameSpace : function (name) { return this.target.name + "." + name; },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
  // will be set on initialization
  _numSets : undefined,
  _initSorting : function () {
    this._numSets = Utils.size(this.sets);
  },
  methods : {
    get : function (set, options, callback) { this.get(set,options,callback); }
  },
  // add a model object to a set.
  add : function (name, score, id, callback) {
    var self = this
      , fnName = self.sets[name][1];
      
    if (typeof score === 'number' && !self.sets[name][1]) {
      db.sortedSetAdd(self.nameSpace(name), score, id, callback);
    }
    // if a second param is provided, it's what the value needs to be to be added.
    else if (self.sets[name][1] != undefined) {
      if (typeof self[fnName] === 'function') {
        if (self[fnName](object))
          db.setAdd(self.nameSpace(name), id, callback);
      } else if (score === self.sets[name][1]) {
        db.setAdd(self.nameSpace(name), id, callback);
      }
      else callback(null,false);
    }
    // if nothing to add at least invoke the cb with false.
    else callback(null,false);
  },
  // remove a model object from a set
  remove : function (name, score, id, callback) {
    var self = this;
    if (typeof score === 'number' && !self.sets[name][1]) {
      db.sortedSetRemove(self.nameSpace(name), score, callback);
    }
    // if a second param is provided, it's an unsorted set.
    else if (self.sets[name][1]) db.setRemove(self.nameSpace(name), id, callback);
    // if nothing to add at least invoke the cb with false.
    else callback();
  },
  // get a set.
  get : function (set, options, callback) {
    var self = this
      , events = []
      , count = 0;

    if (typeof options === 'function') { callback = options; options = undefined; }
    options || (options = {});
    options.start || (options.start = 0);
    options.end || (options.end = -1);

    if (!self.sets[set] && set !== 'all') return self.cb(new Err.Controller('Invalid Set Get Request: ' + set),false, callback);

    if (set === 'all' || self.sets[set][1]) {
      db.setMembers(self.nameSpace(set), function(err,ids){
        if (err || !ids) { return self.cb(err,null,callback); }
        if (options.ids) { return callback(null,ids); }
        if (!ids.length) { return self.cb(null, [], callback); }
        
        self.target.read(ids, options, callback);
      });
    }
    else
      db.sortedSetRange( self.nameSpace(set), options.start, options.end, function(err,ids){
        if (err || !ids) { return callback(err,[]); }
        if (ids.length) {
          if (options.ids) { return callback(ids); }
          else { self.target.read(ids, options, callback); }
        } else {
          callback(null,[]);
        }
      });
  },
});

module.exports = Sorting;