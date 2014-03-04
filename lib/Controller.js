var db = require('ninjazord')
  , Utils = require('./Utils')
  , Err = require('./Err')
  , EventEmitter = require('events').EventEmitter
  , Model = require('./Model')
  , Relationships = require('./Relationships')
  , Autocomplete = require('./Autocomplete')
  , Stats = require('./Stats')
  , Sorting = require('./Sorting')
  , Indexes = require('./Indexes')
  , _ = require('underscore');

var Controller = function () {
  var self = this;
  EventEmitter.call(this);

  if (!this.model instanceof Model) throw 'model required for Controller';
  this.name = this.model.name;

  this.model.on('created', _.bind(this.created, this));
  this.model.on('updated', _.bind(this.updated, this));
  this.model.on('deleted', _.bind(this.deleted, this));

  if (this.protocols.length) {
    this.protocols.forEach(function(Protocol) {
      new Protocol(self);
    });
  }
  this.initialize.apply(this);
}

Utils.extend(Controller.prototype, {
  // Inherit The model from EventEmitter
  __proto__ : EventEmitter.prototype,
  // Give Controller a copy of the DB 
  db : db,
  // Export error for easy error creation
  Error : Err.Controller,
  // Model property must be set
  model : undefined,
  // empty init function for overriding
  initialize : function (options) {},
  // An array of any Protocols you'd like this model to conform to.
  // Will be called on construction, see Protocols file.
  protocols : [Relationships, Stats, Autocomplete, Sorting, Indexes],

  // Basic Crud
  create : function (attrs, options, callback) {
    var self = this;
    if (typeof options === "function") { callback = options; options = undefined; }
    options || (options = {})
    self.model.create(attrs,options,function(err,model){
      if (err) { return self.cb(err,null,callback); }
      self.postCreate(model,options,function(err){
        if (err) { return self.cb(err,null,callback); }
        self.cb(err,model,callback);
      });
    });
  },
  postCreate : function (model, options, done) {
    done();
  },
  read : function(ids, options, callback) {
    var self = this, method;
    
    if (typeof options == "function") { callback = options; options = undefined; }
    options || (options = {});
    // unless private : true is specified, we read with
    // the public method
    method = (options.private) ? 'private' : 'public';

    // accept an array of model Ids
    if (ids instanceof Array) {
      var objects = [], count = ids.length;
      options.set = true;
      ids.forEach(function(id){
        self.model.read(id, options, function(err, object){
          if (err) { if (--count === 0) { return self.cb(err, undefined, callback); } return; }
          self.postRead(object, options, function(err){
            if (err) { if (--count === 0) { return self.cb(err, undefined, callback); } return; }
            // if the object returns false, we don't want to add it.
            if (typeof object === 'object') objects.push( self.model[method](object) );
            if (--count === 0) { return self.cb(null, objects, callback); }
          });
        });
      });

    // or just a single id.
    } else {
      self.model.read(ids, options, function(err, object){
        if (err || !object) { return self.cb(err, undefined, callback); }
        self.postRead(object, options, function (err) {
          self.cb(err, self.model[method](object), callback);
        });
      });
    }

    return this;
  },
  readRecent : function (number, options, callback) {
    var self = this;

    if (typeof options === "function") { callback = options; options = {}; }
    options || (options = {})

    self.db.sortedSetRevRange(self.nameSpace('created'), 0, number, function(err,ids){
      if (err || !ids) { return self.cb(err, [], callback); }
      self.read(ids,options,callback);
    });
  },
  postRead : function (object, options, done) {
    done();
  },
  update : function (object, options, callback) {
    this.model.update(object, options, callback);
  },
  del : function (id, options, callback) {
    var self = this;
    
    if (typeof options === "function") { callback = options; options = undefined; }
    options || (options = {})
    if (typeof id === "object") { id = object.id; }
    
    self.relationship.deletePermission(id, function(err,permission){
      if (!permission) { return self.cb(new self.Error('can\'t delete. remove all references first.'),null,callback); }
      self.model.del(id,options,function(err,object){
        self.relationship.cascadeDelete(id, function(err,res){
          self.cb(err,res,callback);
        });
      });
    });
  },
  /* ------ * Find * ------ */
  // give find either an object, or the value of the first
  // set defined in the controller's indexes, & it will return
  // an array of all matching objects.
  // eg. Users.indexes = ['username','email']
  // Users.find()
  find : function (params, options, callback) {
    if (arguments.length === 2) { callback = options; options = undefined; }
    options || (options = {})

    var self = this
      , terms = {}
      , hits = []
      , count;

    // if params isn't an object, by default look up against the first index in self.indexes
    (typeof params != 'object') ? (terms[self.indexes[0]] = params) : (terms = params);

    count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (terms[index]) {
        self.db.getHash(self.index.indexName(index),terms[index],function(err,id){
          if (err) { return self.cb(err,null,callback); }

          if (id) hits.push(id);
          if (--count === 0) {
            if (hits.length) self.read(hits, options, callback);
            else self.cb(err,[], callback);
          }
        });
     } else if (--count === 0) self.cb(null,hits,callback);
    });
  },
  // all controller storage is namespaced under the same namespace
  // as the model.
  nameSpace : function (name) { return this.name + '.' + name; },

  created : function (object, options) {
    var self = this
      , sets = self.sets
      , count = Object.keys(sets).length;

    self.index.add(object,function(){
      if (count === 0) {
        self.emit('model:created', object);
      } else {
        for (var set in sets) {
          var scoreAttr = sets[set][0]
            , score = object[scoreAttr];

          --count;
          self.sorting.add(set, score, object.id, function(err,res){
            if (count === 0) { self.emit('model:created', object); }
          });
        }
      }
    });

    self.stats.add(object);
    return this;
  },
  updated : function (object, oldObject, options) {
    var self = this
      , sets = self.sets
      , count = Object.keys(sets).length;

    self.index.remove(oldObject, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = oldObject[scoreAttr];

        self.sorting.remove(set, score, oldObject.id, function(){});
      }
    });

    self.index.add(object, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = object[scoreAttr];

        --count;
        self.sorting.add(set, score, object.id, function(err,res){
          if (count === 0) self.emit('model:updated', object);
        });
      }
    });

    self.stats.update(object, oldObject);

    return this;
  },
  deleted : function (object) {
    var self = this
      , sets = self.sets
      , count = Object.keys(sets).length;

    self.index.remove(object, function(){
      for (var set in sets) {
        var scoreAttr = sets[set][0]
          , score = object[scoreAttr];

        --count;
        self.sorting.remove(set, score, object.id, function(){
          if (count === 0) { self.emit('model:deleted',object);}
        });
      }
    });

    self.stats.remove(object);

    return this;
  },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  }
});

// Model Extend Method.
Controller.extend = Utils.classExtend;

module.exports = Controller;