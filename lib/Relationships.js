var Protocol = require('./Protocol')
	, db = require('ninjazord')
	, _ = require('underscore');

// Relationships are models this model should maintain a list of.
// they use the name of the specified model as thier key and take an object
// as their value. That object should have 'model','key', 'added', and 'removed'
// fields. added & removed should be the name of the function that are invoked when a 
// relationship is created. the function should be bound to the root object.
// we have to encase this name as a string because of context switching.
// eg: (for a model "Company")
// 'employees' : { model : Employee, key : 'companyId', callback : 'employeeCreated' }

// sortedSets - an array of relationship attributes that the model should hold a sorted set of.

// Relationship Delete Rules :
// based on coreData Delete rules for relationships
// https://developer.apple.com/library/mac/documentation/cocoa/conceptual/coredata/articles/cdRelationships.html
// a refernce can set the 'deleteRule' property to any of the following
// 'nullify' - (default) remove the relationship on deletion.
// 'deny' - @warning @unimplemented - deny deletion if there are any relationships
// 'cascade' - delete all relationshipd objects on delete
// 'noAction' - @warning @unimplemented - do nothing
var Relationships = Protocol.extend({
	name : "relationship",
	initialize : function (target) {
		if (!target.name) { throw "relationships target object must have a name"; }
		this.target = target;
		this.relationships = target.relationships;
		
		if (this.relationships) {
			this._verifyRelationships();
			this.addRelationshipListeners();
			this._addRelationshipAttributes();
		}

	},
	nameSpace : function (name) { return this.target.name + "." + name; },
	// callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
	get : function (id, relationshipName, callback) {
		var self = this;
		if (!self.relationships[relationshipName]) return self.cb(new self.Error("invalid relationship name: " + relationshipName),false, callback);

		var Model = self.relationships[relationshipName].model
			, name = self.relationships[relationshipName]._name;
		db.setMembers(self.nameSpace(id) + '.' + name, function(err,relationships){
			if (err) { return self.cb(err,undefined,callback); }
			if (relationships.length) {
				relationships.forEach(function(id,i){ relationships[i] = +id; });
				self.cb(undefined,relationships,callback);
			}
			else self.cb(err,[],callback);
		});
	},
	read : function (id, relationshipName, options, callback) {
		var self = this;
		if (typeof options === "function") { callback = options; options = {}; }
		options || (options = {})

		self.get(id, relationshipName, function (err, ids) {
			if (err) return self.cb(err,undefined, callback);
			if (!ids.length) { return self.cb(err, ids, callback); }
			self.relationships[relationshipName].model.read(ids, options, function(err, relationships){
				if (err) { return self.cb(err,false,callback); }
				if (relationships && !relationships instanceof Array) { relationships = [relationships];}
				self.cb(err,relationships, callback);
			});
		});
	},
	getSorted :  function (id, relationshipName, sortName, number, reverse, callback) {
		var self = this;
		
		if (arguments.length === 4) { callback = number; number = 5; reverse = false; }
		else if (arguments.length === 5) { callback = reverse; reverse = false; }

		if (reverse) {
			db.sortedSetRevRange(self._relationshipSortedSetKey(id, relationshipName, sortName), 0, number, function(err, ids){
				self.cb(err, (ids || []), callback); 
			});
		} else {
			db.sortedSetRange(self._relationshipSortedSetKey(id, relationshipName, sortName), 0, number, function(err, ids){
				self.cb(err, (ids || []), callback); 
			});
		}
	},
	readSorted : function (id, relationshipName, sortName, number, reverse, callback) {
		var self = this;
		if (arguments.length === 4) { callback = number; number = 5; reverse = false;}
		else if (arguments.length === 5) { callback = reverse; reverse = false; }
		
		self.getSorted(id, relationshipName, sortName, number, reverse, function(err,ids){
			if (err) { return self.cb(err, null, callback); }
			if (!ids.length) { return self.cb(null, [], callback); }
			self.relationships[relationshipName].model.read(ids,callback);
		});
	},
	// @warning - this deletes stuff.
	deleteRelationshipObjects : function (id, relationshipName, callback) {
		var self = this, count;
		self.get(id, relationshipName, function(err,refIds){
			if (err || !refIds) { return self.cb(err,undefined, callback); }
			if (!refIds.length) { return self.cb(err,undefined, callback); }
			count = refIds.length;
			refIds.forEach(function(refId){
				self.relationships[relationshipName].model.del(refId, function(err,res){
					if (--count == 0) { self.cb(null, true, callback); }
				});
			});
		});
	},
	exists : function (id, relationshipId, relationshipName, callback) {
		db.setIsMember(this.nameSpace(id) + '.' + relationshipName, relationshipId, callback);
	},
	addRelationshipListeners : function () {
		var self = this;

		for (var refName in this.relationships) {
			var relationship = this.relationships[refName]
			if (typeof relationship !== 'object') throw "relationships must have an object { model : '', key : ''} as their value";

			if (typeof self[relationship.added] === 'function') relationship.added = self[relationship.added];
			if (typeof self[relationship.removed] === 'function') relationship.removed = self[relationship.added];

			// @todo - make sure Model actually inherits from a Model.
			if (!relationship.model || !relationship.key) throw "must provide a model and a key for relationship : " + refName;

			relationship.model.on('created', _.bind(self.addReference, self, refName, relationship) );
			relationship.model.on('updated', _.bind(self.referenceUpdated, self, refName, relationship) );
			relationship.model.on('deleted', _.bind(self.removeReference, self, refName, relationship) );

		}
	},
	removeRelationshipListeners : function () {
		var self = this;
		for (var refName in this.relationships) {
			var relationship = this.relationships[refName];

			relationship.model.off('created', _.bind(self.addReference, self, refName, relationship) );
			relationship.model.off('updated', _.bind(self.referenceUpdated, self, refName, relationship) );
			relationship.model.off('deleted', _.bind(self.removeReference, self, refName, relationship) );

		}
	},
	_relationshipCountName : function (relationshipName) { return relationshipName + "Count"; },
	_relationshipSortedSetKey : function(id, relationshipName, sortName) { return this.nameSpace(id) + '.' + relationshipName + '.sorted.' + sortName; },
	_addRelationshipAttributes : function () {
		var self = this, relationship, refName, countAttributeName;
		for (refName in this.relationships) {
			relationship = this.relationships[refName];
			if (relationship.countAttribute) {
				if (typeof relationship.countAttribute === "string") {
					countAttributeName = relationship.countAttribute;
				} else {
					countAttributeName = self._relationshipCountName(refName);
					relationship.countAttribute = countAttributeName;
				}

				self.target.model.attributes[countAttributeName] || (self.target.model.attributes[countAttributeName] = ["number", true, false, 0])
			}
			if (relationship.currentAttribute) {
				self.target.model.attributes[relationship.currentAttribute] || (self.target.model.attributes[relationship.currentAttribute] = ["number"])
			}
		}
	},
	addReference : function (name, relationship, model, options) {
		options || (options = {})
		var self = this
			, id = relationship.model.id(model[relationship.key])
			, tasks = 1
			, count;

		// if filter is defined, it should be a string pointing to a truth-test function
		// on the target. If that test returns any non-truthy value, we should bail
		// without doing anything.
		if (typeof relationship.filter === "string") {
			if (typeof self.target[relationship.filter] === "function") {
				if (!self.target[relationship.filter].call(self.target, model, options)) { return; }
			}
		}

		function done () {
			if (--tasks <= 0) {
				if (typeof self.target[relationship.added] === 'function') _.bind(self.target[relationship.added], self.target)(model, options);
				// self.emit('relationshipAdded', id, model.id, name, options);
			}
		}

		if (!id) return;
		if (relationship.countAttribute) { 
			tasks++;
			db.hashIncrBy(self.nameSpace(id), relationship.countAttribute, 1, done); 
		}

		if (relationship.currentAttribute){
			tasks++;
			var hash = {};
			hash[relationship.currentAttribute] = model.id;
			db.setHash(self.nameSpace(id), hash, done);
		}

		if (relationship.sortedSets instanceof Array) {
			tasks++;
			count = relationship.sortedSets.length;
			relationship.sortedSets.forEach(function(sortedAttributeName){
				if (model[sortedAttributeName]) {
					db.sortedSetAdd(self._relationshipSortedSetKey(id, name, sortedAttributeName),model[sortedAttributeName],model.id, function(err,res){
						if (--count === 0 ) { done(); }
					});
				} else {
					if (--count === 0) { done(); }
				}
			});
		}

		db.setAdd(self.nameSpace(id) + '.' + relationship._name, model.id, function(err){
			if (err) { return; }
			done();
		});
	},
	removeReference : function (name, relationship, model, options) {
		var self = this
			, id = relationship.model.id(model[relationship.key])
			, tasks = 1
			, count;
		
		function done () {
			if (--tasks <= 0) {
				if (typeof self.target[relationship.removed] === 'function') _.bind(self.target[relationship.removed], self.target)(model,options);
				// self.emit('relationshipRemoved', id, model.id, name);
			}
		}

		if (!id) return;
		if (relationship.countAttribute) {
			tasks++;
			db.hashIncrBy(self.nameSpace(id), relationship.countAttribute, -1, done); 
		}

		if (relationship.currentAttribute){
			tasks++;
			db.hashDelete(self.nameSpace(id),relationship.currentAttribute, done);
		}

		if (relationship.sortedSets instanceof Array) {
			tasks++;
			count = relationship.sortedSets.length;
			relationship.sortedSets.forEach(function(sortedAttributeName){
				if (model[sortedAttributeName]) {
					db.sortedSetRemove(self._relationshipSortedSetKey(id, name, sortedAttributeName),model[sortedAttributeName],model.id, function(err,res){
						if (--count === 0 ) { done(); }
					});
				}
			});
		}

		db.setRemove(self.nameSpace(id) + '.' + relationship._name, model.id, function(err){
			if (err) { return; }
			done();
		});
	},
	referenceUpdated : function (name, relationship, model, oldModel, options) {
		// if we've updated with a different parent key,
		// we need to move the relationship.
		var self = this
			, id = relationship.model.id(model[relationship.key])
			, oldId = relationship.model.id(oldModel[relationship.key]);

		if (id !== oldId) {
			self.removeReference(name, relationship, oldModel);
			self.addReference(name, relationship, model);
		}
	},
	// @todo - eventually this will be to handle "deny" deleteRule
	// where objects cannot be deleted unless all relationships are removed
	deletePermission : function (id, callback) {
		return this.cb(null, true, callback);
	},
	// If the relationship delete rule is set to "cascade", we delete the object
	// when the parent is deleted.
	cascadeDelete : function (id, callback) {
		var self = this, refName, relationship, tasks = 1;
		if (!self.relationships) { return self.cb(null,false,callback); }
		if (!Object.keys(self.relationships).length) { return self.cb(null,false, callback); }

		function done (err, res) { if (--tasks <= 0){ self.cb(err,true,callback); }}

		for (refName in self.relationships) {
			relationship = self.relationships[refName];
			if (relationship.deleteRule == "cascade") {
				tasks++;
				self.deleteRelationshipObjects(id, refName, done);
			}
		}
		
		done();
	},
	_verifyRelationships : function () {
		if (typeof this.relationships != "object") { throw this.target.name + " relationships must be an object"; }
		for (var relationship in this.relationships) {
			this.relationships[relationship]._name = relationship;
		}
		return this;
	}
});

module.exports = Relationships;