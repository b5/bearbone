var db = require('ninjazord')
	, Utils = require('./Utils')
	, EventEmitter = require('events').EventEmitter
	, childModel = require('./ChildModel');

var ChildController = function (options) {
	var self = this;
	EventEmitter.call(this);

	if (!self.model) throw 'ChildModel required for child ChildController';

	self.model.on('created',Utils.bind(self.created, self));
	self.model.on('updated',Utils.bind(self.updated, self));
	self.model.on('deleted',Utils.bind(self.deleted, self));

	self.setCount = Utils.size(self.sets);
	self.initialize.apply(this,options);
};

Utils.extend(ChildController.prototype, {
	// inherit from EventEmitter
	__proto__ : EventEmitter.prototype,
	// store a reference to the db.
	db : db,
	// the model that this controller will listen to.
	// gotta set this sucker.
	model : undefined,
	// initialize is an empty function for overriding
	initialize : function () {},
	// sets are stored references to invidual models
	sets : undefined,
	// will be set on initialization
	setCount : undefined,
	// *important* all controller storage is namespaced under the same namespace
	// as the model.
	nameSpace : function (parentModel, parentId, name) { return parentModel + '.' + parentId + '.' + this.model.name + '.' + name; },
	// add a model object to a set.
	add : function (name, parentModel, parentId, id, score, callback) {
		var self = this;

		// Add to the "all" set.
		self.db.setAdd(self.nameSpace(parentModel, parentId, 'all'), id, function(){

			//console.log('add %s, %s, %s', name, score, id);
			if (typeof score === 'number' && !self.sets[name][1]) {
				self.db.sortedSetAdd(self.nameSpace(parentModel, parentId, name), score, id, function(res){
					callback(res);
				});
			}
			// if a second param is provided, it's what the value needs to be to be added.
			else if (self.sets[name][1]) {
				if (score == self.sets[name][1])
					self.db.setAdd(self.nameSpace(parentModel, parentId, name), id, callback);
			}
			// if nothing to add at least invoke the cb with false.
			else return callback(false);

		});
	},
	// remove a model object from a set
	remove : function (name, score, id, callback) {
		var self = this;

		if (typeof score === 'number' && !self.sets[name][1]) {
			self.db.sortedSetRemove(self.nameSpace(parentModel, parentId, name), score, function(res){
				self.cb(res, callback);
			});
		}
		// if a second param is provided, it's an unsorted set.
		else if (self.sets[name][1]) self.db.setRemove(self.nameSpace(parentModel, parentId, name), id, callback);
		// if nothing to add at least invoke the cb with false.
		else return self.cb(false, callback);
	},
	// get a set.
	get : function (set, parentModel, parentId, options, callback) {
		if (typeof parentModel === 'function' || typeof parentId === 'function') throw 'this is a ChildController. you must specify set, parentModel, parentId, [options], callback';
		var self = this
			, events = []
			, count = 0;

		if (typeof options === 'function') { callback = options; options = undefined; }
		options || (options = {})
		options.start || (options.start = 0)
		options.end || (options.end = -1)

		if (!self.sets[set] && set !== 'all') return self.cb(false, callback);

		if (set === 'all' || self.sets[set][1]) {
			self.db.setMembers(self.nameSpace(parentModel, parentId, set), function(ids){
				if (ids.length) self.model.read({ parentModel : parentModel, parentId : parentId, id: ids }, callback);
				else callback([]);
			});
		}
		else
			self.db.sortedSetRange( self.nameSpace(parentModel, parentId, set), options.start, options.end, function(ids){
				if (ids.length) self.model.read({ parentModel : parentModel, parentId : parentId, id : ids },callback);
				else callback([]);
			});
	},
	// Indexes are reverse-lookups. They will store a model
	// attribute & give back the id.
	// works exlusively with the find command.
	// it is implied that indexed attributes MUST be unique
	// eg. indexes : ['username','email'] 
	indexes : undefined,
	indexName : function (parentModel, parentId, name) { return parentModel + '.' + parentId + '.' + this.name + '.index.' + name; },
	addIndexes : function (object, callback) {
		if (!this.indexes) return callback();
		var self = this, count = self.indexes.length;
		self.indexes.forEach(function(index){
			if (object[index]) {
				var entry = {}
				entry[object[index]] = object.id
				self.db.setHash(self.indexName(object.parentModel, object.parentId, index), entry, function(){
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
				self.db.hashDelete(self.indexName(object.parentModel, object.parentId, index), object[index], function(){
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
	find : function (params, parentModel, parentId, callback) {
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
	created : function (object) {
		if (!object.parentModel || !object.parentId) return false;
		var self = this
			, sets = self.sets
			, count = self.setCount;

		self.addIndexes(object,function(){
			for (var set in sets) {
				var scoreAttr = sets[set][0]
					, score = object[scoreAttr];

				--count;
				self.add(set, object.parentModel, object.parentId, object.id, score, function(){
					if (count === 0) self.emit('model:created',object);
				});
			}
		});
		
		return this;
	},
	updated : function (object) {
		if (!object.parentModel || !object.parentId) return false;
		this.emit('model:updated',object);
		return this;
	},
	deleted : function (object) {
		if (!object.parentModel || !object.parentId) return false;
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

ChildController.extend = Utils.classExtend;

module.exports = ChildController;