var db = require('ninjazord')
  , Utils = require('./Utils')
  , Err = require('./Err')
  , EventEmitter = require('events').EventEmitter
  , completer = require('./Autocomplete')
  , _ = require('underscore');

// @todo / @feature - Controllers on Events.
// @todo / @feature - Get Method that allows intersection of multiple sets.
// @todo / @feature - More robust 'find' method that looks for string partials / lowercase matches
// ** @todo  - Controller Sets take a function argument to qualify the model object for the set.
//             Would allow for a great separation of business logic
// ** @todo  - Some sets change their order over time / as new models come into the mix. how
//             should we address this?

var Controller = function (options) {
  var self = this;
  EventEmitter.call(this);

  if (!self.model) throw 'model required for Controller';
  self.name = this.model.name;

  self.model.on('created', Utils.bind(self.created, self));
  self.model.on('updated', Utils.bind(self.updated, self));
  self.model.on('deleted', Utils.bind(self.deleted, self));

  if (!self.sets) throw 'for a Controller to work you need to define a sets object';
  self._numSets = Utils.size(self.sets);
  self.initialize.apply(self, options);

  if (this.checkCompletions()) {
    self._completer.applicationPrefix( db.getPrefix() + 'completions');
    this.addCompletions();
  }

  self._validateTrackedAttributes;
}

Utils.extend( Controller.prototype, {
  // Inherit The model from EventEmitter
  __proto__ : EventEmitter.prototype,
  // Give Controller a copy of the DB 
  db : db,
  // Export error for easy error creation
  Error : Err.Controller,
  // Model property must be set
  model : undefined,
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
  sets: undefined,
  // will be set on initialization
  _numSets : undefined,
  // Indexes are reverse-lookups. They will store a model
  // attribute & give back the id.
  // works exlusively with the find command.
  // it is implied that indexed attributes MUST be unique
  // eg. indexes : ['username','email'] 
  indexes : undefined,
  indexName : function (name) { return this.name + '.index.' + name; },
  addIndexes : function (object, callback) {
    if (!this.indexes) return callback();
    var self = this, count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (object[index]) {
        var entry = {};
        entry[object[index]] = object.id;
        self.db.setHash(self.indexName(index), entry, function(err){
          if (--count === 0) callback();
        }); 
      } else if (--count === 0) callback();
    });
  },
  removeIndexes : function (object, callback) {
    if (!this.indexes) return callback();
    var self = this, count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (object[index]) {
        self.db.hashDelete(self.indexName(index), object[index], function(err){
          if (err) { return self.cb(err,null,callback); }
          if (--count === 0) callback();
        });
      } else if (--count === 0) callback();
    });
  },
  // give find either an object, or the value of the first
  // set defined in the controller's indexes, & it will return
  // an array of all matching objects.
  // eg. Users.indexes = ['username','email']
  // Users.find()
  find : function (params, callback) {
    var self = this
      , terms = {}
      , hits = []
      , count;

    // if params isn't an object, by default look up against the first index in self.indexes
    (typeof params != 'object') ? (terms[self.indexes[0]] = params) : (terms = params);

    count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (terms[index]) {
        self.db.getHash(self.indexName(index),terms[index],function(err,id){
          if (err) { return self.cb(err,null,callback); }

          if (id) hits.push(id);
          if (--count === 0) {
            // @warning - for search to work, model.read *must*
            // be able to take an array of ids.
            
            // @todo - add 'options' to find method signature
            // currently 'private' is being flagged for user lookups in passport
            // to keep the password around for checking.
            if (hits.length) self.model.read(hits,{ private : true }, callback);
            else self.cb(err,[], callback);
          }
        });
     } else if (--count === 0) self.cb(err,hits,callback);
    });
  },
  // empty init function for overriding
  initialize : function (options) {},
  // *important* all controller storage is namespaced under the same namespace
  // as the model.
  nameSpace : function (name) { return this.name + '.' + name; },
  // add a model object to a set.
  add : function (name, score, id, callback) {
    var self = this
      , fnName = self.sets[name][1];

    //console.log('add %s, %s, %s', name, score, id);
    
    if (typeof score === 'number' && !self.sets[name][1]) {
      self.db.sortedSetAdd(self.nameSpace(name), score, id, callback);
    }
    // if a second param is provided, it's what the value needs to be to be added.
    else if (self.sets[name][1]) {
      if (typeof self[fnName] === 'function') {
        if (self[fnName](object))
          self.db.setAdd(self.namespace(name), id, callback);
      } else if (score === self.sets[name][1]) {
        self.db.setAdd(self.nameSpace(name), id, callback);
      }
    }
    // if nothing to add at least invoke the cb with false.
    else callback();
  },
  // remove a model object from a set
  remove : function (name, score, id, callback) {
    var self = this;

    if (typeof score === 'number' && !self.sets[name][1]) {
      self.db.sortedSetRemove(self.nameSpace(name), score, callback);
    }
    // if a second param is provided, it's an unsorted set.
    else if (self.sets[name][1]) self.db.setRemove(self.nameSpace(name), id, callback);
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
      self.db.setMembers(self.nameSpace(set), function(err,ids){
        if (err) { return self.cb(err,null,callback); }
        if (options.ids) { return callback(null,ids); }
        if (!ids.length) { return self.cb(null, [], callback); }
        
        self.model.read(ids, options, callback);
      });
    }
    else
      self.db.sortedSetRange( self.nameSpace(set), options.start, options.end, function(err,ids){
        if (ids.length) {
          if (options.ids) { return callback(ids); }
          else { self.model.read(ids, options, callback); }
        } else {
          callback(null,[]);
        }
      });
  },
  created : function (object) {
    var self = this
      , sets = self.sets
      , count = self._numSets;

    self.addIndexes(object,function(){
      if (count === 0) {
        self.emit('model:created', object);
      } else {
        for (var set in sets) {
          var scoreAttr = sets[set][0]
            , score = object[scoreAttr];

          --count;
          self.add(set, score, object.id, function(err,res){
            if (count === 0) self.emit('model:created', object);
          });
        }
      }
    });

    self._addStats(object);
    return this;
  },
  updated : function (object, oldObject) {
    var self = this
      , sets = self.sets
      , count = self._numSets;

    self.removeIndexes(oldObject, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = oldObject[scoreAttr];

        self.remove(set, score, oldObject.id, function(){});
      }
    });

    self.addIndexes(object, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = object[scoreAttr];

        --count;
        self.add(set, score, object.id, function(){
          if (count === 0) self.emit('model:updated', object);
        });
      }
    });

    self._updateStats(object, oldObject);

    return this;
  },
  deleted : function (object) {
    var self = this
      , sets = self.sets
      , count = self._numSets;
    self.removeIndexes(object, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = object[scoreAttr];

        --count;
        self.remove(set, score, object.id, function(){
          if (count === 0) { self.emit('model:deleted',object);}
        });
      }
    });

    self._removeStats(object);

    return this;
  },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
  bind : Utils.bind,
  /* ------- * Autocompletion * ------- */
  // autocompletion is used by setting the completions hash

  // export the raw completer. Probaly shouldn't be used
  // outside the controller.
  _completer : completer,
  // prefix for completer namespace
  _completerPrefix : function () { return this.model.name + ':'; },
  // add an attribute as the key, with a value of a number from 0-99 to
  // indicate the weight of the attribute against the others.
  // eg. { name : 99 }
  completions : {},
  checkCompletions : function () {
    var self = this,
        clean = true,
        key, val;

    if (!Utils.size(self.completions)) { return false; }

    for (key in self.completions) {
      val = self.completions[key];
      if (typeof val != 'number') {
        console.error('%s autocomplete attribute %s needs a 0-99 number as it\'s value',self.model.name,key);
        clean = false;
        continue;
      } else if (val < 0 || val > 99) {
        console.error('%s autocomplete attribute %s is not a number between 0 and 99',self.model.name, key);
        clean = false;
        continue;
      }
    }

    return clean;
  },
  addCompletions : function(callback){
    var self = this, count;
    self.get('all', function(err, models){
      if (err || Utils.typeOf(models) !== 'array') { return self.cb(err, undefined, callback); }
      count = models.length;
      models.forEach(function(model){
        if (model.id) {
          for (var key in self.completions) {
            var val = self.completions[key];
            if (model[key]) {
              self._completer.addCompletions( self._completerPrefix() + model[key], model.id, val, function(err, res){
                if (--count === 0) { self.cb(null, undefined, callback); }
              });
            }
          }
        }
      });
    });
  },
  autocomplete : function (query, count, callback) {
    var self = this;

    if (arguments.length === 2) { callback = count; count = 99; }

    self._completer.search(self._completerPrefix() + query, count, function(err,results){
      if (err) { return self.cb(err,null,callback); }
      if (results.length) {
        results.forEach(function(r,i){ results[i] = parseInt(r.split(':')[0], 10); });
        results = _.uniq(results);
        self.model.read(results, { array : true }, function(err, models){
          if (err) { return self.cb(err, undefined, callback); }
          if (Utils.typeOf(models) !== 'array') { models = [models]; }
          self.cb(null, models, callback);
        });
      } else self.cb(null, [], callback);
    });
  },
  search : function (query, callback) {
    self.autocomplete(query, 50, callback);
  },
  // add any attribute names here to track counts on their differences.
  trackedAttributes : [],
  stats : function (options, callback) {
    var self = this, stats = {}, tasks = 2 + this.trackedAttributes.length;

    if (arguments.length === 1) { callback = options; options = {}; }
    options || (options = {});

    function done(){ if (--tasks === 0) return self.cb(null, stats, callback); }
    function error(err){ tasks = -1; return self.cb(err, undefined, callback); }

    self.db.get(self.name + '.stats.count', function(err, count){
      if (err) { return error(err); }
      stats.count = parseInt(count, 10);
      done();
    });

    self.db.sortedSetRange(self.name + '.stats.dailies', 0, -1, true, function(err, set){
      if (err) { return error(err); }
      for (var i = 1; i < set.length; i = i + 2) {
        var num = parseInt(set[i], 10);
        if (!isNaN(num)) { set[i] = num; }
      }
      stats.dailies = set;
      done();
    });

    self.trackedAttributes.forEach(function(attr){
      self.db.getHash(self.name + '.stats.' + attr, function(err, counts){
        if (err) { return error(err); }
        for (var val in counts) {
          counts[val] = parseInt(counts[val], 10);
        }
        stats[attr] = counts;
        done();
      });
    });
  },
  _addStats : function (object) {
    var self = this
      , day = Utils.todayDate(new Date(parseInt(object.created,10))).valueOf();

    self.db.incr(self.name + '.stats.count');
    self.db.sortedSetIncrBy(self.name + '.stats.dailies',1,day);

    self.trackedAttributes.forEach(function(attr){
      if (object[attr]) self.db.hashIncrBy(self.name + '.stats.' + attr,object[attr], 1);
    });
  },
  _updateStats : function (object, oldObject) {
    var self = this;

    self.trackedAttributes.forEach(function(attr){
      if (oldObject[attr]) self.db.hashIncrBy(self.name + '.stats.' + attr, oldObject[attr], -1);
      if (object[attr]) self.db.hashIncrBy(self.name + '.stats.' + attr, object[attr], 1);
    });
  },
  _removeStats : function (object) {
    var self = this
      , day = Utils.todayDate(new Date(parseInt(object.created,10))).valueOf();
    self.db.decr(self.name + '.stats.count');
    self.db.sortedSetIncrBy(self.name + '.stats.dailies', -1, day);

    self.trackedAttributes.forEach(function(attr){
      if (object[attr]) self.db.hashIncrBy(self.name + '.stats.' + attr,object[attr], -1);
    });
  },
  _validateTrackedAttributes : function () {
    var self = this;
    self.trackedAttributes.forEach(function(attr){
      if (!self.model.attributes[attr]) { throw new Err.ConfigErr( "'" + attr + "' attribute Specified for tracking does not exist on " + self.model.name + " model."); }
    });
  }
});

// Model Extend Method.
Controller.extend = Utils.classExtend;

module.exports = Controller;