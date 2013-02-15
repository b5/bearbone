var db = require('ninjazord')
  , Utils = require('./Utils')
  , EventEmitter = require('events').EventEmitter;

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
  this.name = this.model.name;

  self.model.on('created', Utils.bind(self.created, self));
  self.model.on('updated', Utils.bind(self.updated, self));
  self.model.on('deleted', Utils.bind(self.deleted, self));

  if (!self.sets) throw 'for a Controller to work you need to define a sets object';
  self.setCount = Utils.size(self.sets);
  self.initialize.apply(self, options);
}

Utils.extend( Controller.prototype, {
  // Inherit The model from EventEmitter
  __proto__ : EventEmitter.prototype,
  // Give Controller a copy of the DB 
  db : db,
  // Model property must be set
  model : undefined,
  // sets property must be an object with array values
  // where the first value in the array is the param to sort
  // the set by. 
  // pass true after the param name to have the collection keep
  // a set on the conditional existence of the param. 
  // eg. sets : {
  //    all : ['created'],
  //    recent : ['updated'],
  //    hidden : ['hidden', true]
  // }
  sets: undefined,
  // will be set on initialization
  setCount : undefined,
  // Indexes are reverse-lookups. They will store a model
  // attribute & give back the id.
  // works exlusively with the find command.
  // it is implied that indexed attributes MUST be unique
  // eg. indexes : ['username','email'] 
  indexes : undefined,
  indexName : function (name) { return this.name + '.index.' + name },
  addIndexes : function (object, callback) {
    if (!this.indexes) return callback();
    var self = this, count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (object[index]) {
        var entry = {}
        entry[object[index]] = object.id
        self.db.setHash(self.indexName(index), entry, function(){
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
        self.db.hashDelete(self.indexName(index), object[index], function(){
          if (--count == 0) callback();
        });
      } else if (--count == 0) callback(); 
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
        self.db.getHash(self.indexName(index),terms[index],function(id){
          if (id) hits.push(id);
          if (--count === 0) {
            // @warning - for search to work, model.read *must*
            // be able to take an array of ids.
            
            // @todo - add 'options' to find method signature
            // currently 'private' is being flagged for user lookups in passport
            // to keep the password around for checking.
            if (hits.length) self.model.read(hits,{ private : true }, callback);
            else self.cb([], callback);
          }
        });
     } else if (--count === 0) self.cb(hits,callback);
    });
  },
  // empty init function for overriding
  initialize : function (options) {},
  // *important* all controller storage is namespaced under the same namespace
  // as the model.
  nameSpace : function (name) { return this.name + '.' + name; },
  // add a model object to a set.
  add : function (name, score, id, callback) {
    var self = this;

    //console.log('add %s, %s, %s', name, score, id);
    
    if (typeof score === 'number' && !self.sets[name][1]) {
      self.db.sortedSetAdd(self.nameSpace(name), score, id, function(res){
        callback(res);
      });
    }
    // if a second param is provided, it's what the value needs to be to be added.
    else if (self.sets[name][1]) { 
      if (score == self.sets[name][1])
        self.db.setAdd(self.nameSpace(name), id, callback);
    }
    // if nothing to add at least invoke the cb with false.
    else return callback(false);
  },
  // remove a model object from a set
  remove : function (name, score, id, callback) {
    var self = this;

    if (typeof score === 'number' && !self.sets[name][1]) {
      self.db.sortedSetRemove(self.nameSpace(name), score, function(res){
        self.cb(res, callback);
      });
    }
    // if a second param is provided, it's an unsorted set.
    else if (self.sets[name][1]) self.db.setRemove(self.nameSpace(name), id, callback);
    // if nothing to add at least invoke the cb with false.
    else return self.cb(false, callback);
  },
  // get a set.
  get : function (set, options, callback) {
    var self = this
      , events = []
      , count = 0;

    if (typeof options === 'function') { callback = options; options = undefined; }
    options || (options = {})
    options.start || (options.start = 0)
    options.end || (options.end = -1)

    if (!self.sets[set] && set !== 'all') return self.cb(false, callback);

    if (set === 'all' || self.sets[set][1]) {
      self.db.setMembers(self.nameSpace(set), function(ids){
        if (ids.length) self.model.read(ids,callback);
        else callback([]);
      });
    }
    else
      self.db.sortedSetRange( self.nameSpace(set), options.start, options.end, function(ids){
        if (ids.length) self.model.read(ids,callback);
        else callback([]);
      });
  },
  created : function (object) {
    var self = this
      , sets = self.sets
      , count = self.setCount;

    self.addIndexes(object,function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = object[scoreAttr];

        --count;
        self.add(set, score, object.id, function(){
          if (count === 0) self.emit('model:created',object);
        });
      }
    });
    
    return this;
  },
  updated : function (object) {
    this.emit('model:updated',object);
    return this;
  },
  deleted : function (object) {
    var self = this
      , sets = self.sets
      , count = self.setCount;
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
    return this;
  },
  cb : Utils.cb,
  bind : Utils.bind
});

// Model Extend Method.
Controller.extend = Utils.classExtend;

module.exports = Controller;