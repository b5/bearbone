// ** Abstract Class Does not export a Model object**
var db = require('ninjazord')
	, Err = require('./Err')
	, utils = require('./Utils')
	, EventEmitter = require('events').EventEmitter;

// @todo - add an option to attributes that specifies
// that they must be unique.

var Model = function (options) {
	var self = this
		, name = this.name;

	if (!self.name) throw 'name required for model'; 
	EventEmitter.call(this);

	this.attributes.id || (this.attributes.id = ['number'])
	this.attributes.created || (this.attributes.created = ['number', false, true])
	this.attributes.updated || (this.attributes.updated = ['number', false, true])
	
	if (self.references) {
		self.addReferenceListeners.call(self);
		self._addReferenceAttributes.call(self);
	}

	self.initialize.apply(self, options);
	self.setRequiredAttributes.call(self);
}

utils.extend( Model.prototype, {
	// Inherit The model from EventEmitter
	__proto__ : EventEmitter.prototype,
	// All Models must define a name.
	// @todo - change "name" to "type"
	name : undefined,
	// Give all subsequent models access to database tools
	db : db,
	// Export error for easy error creation
	Error : Err.Model,
	// This dictates what attributes get stored on the model
	// attribute : [ typeof , (requiredForCreation), (private), (defaultVal) ]
	// defaults : [ 'string', false, false, undefined ]
	attributes : {
		id : ['number'],
		created : ['number'],
		updated : ['number']
	},

	// References are models this model should maintain a list of.
	// they use the name of the model as thier key and take an object
	// as their value. That object should have 'model','key', 'added', and 'removed'
	// fields. added & removed should be the name of the function that are invoked when a 
	// reference is created. the function should be bound to the root object.
	// we have to encase this name as a string because of context switching.
	// eg: (for a model "Company")
	// 'employees' : { model : Employee, key : 'companyId', callback : 'employeeCreated' }
	references : undefined,

	// callback utility to only call back if the function exists.
	cb : function (err, res, callback) {
		return (typeof callback === 'function') ? callback(err, res) : false;
	},
	nameSpace : function (id) { return this.name + '.' + id; },
	setRequiredAttributes : function () {
		var self = this, requiredAttributes = [];
		for (var attr in self.attributes) {
			if (self.attributes[attr][1]) requiredAttributes.push(attr);
		}
		self.requiredAttributes = requiredAttributes;
	},
	// @todo
	setUniqueAttributes : function () {

	},
	/* Validate should return either a model error, or true*/
	validate: function(attrs, options) {
		var self = this, valid = true, attrType;
		options || (options = {})
		if (!attrs || typeof attrs != 'object') return new Err.Model("No Attributes Provided");
		if (options.update && !attrs.id) return new Err.Model("No id Provided for update");

		for (var attr in attrs) {
			if (!self.attributes[attr]) { delete attrs[attr]; continue; }

			attrType = self.attributes[attr][0];
			if (typeof attrs[attr] != attrType) {
				// the attribute doesn't match it's type. try to reslove it.
				if (attrType === 'boolean') {
					if (attrs[attr] === 'true') attrs[attr] = true;
					if (attrs[attr] === 'false') attrs[attr] = false;
				} else if (attrType === 'number') {
					attrs[attr] = parseFloat(attrs[attr], 10);
					if ( isNaN(attrs[attr]) || !attrs[attr] ) delete attrs[attr];
				}

				// if it still doesn't match, delete it.
				if (typeof attrs[attr] !== attrType) delete attrs[attr];
			}
		}

		if (!options.update){
			// Add default if no value is supplied.
			for (attr in self.attributes) {
				if ( (self.attributes[attr][3] !== undefined) && attrs[attr] === undefined)
					attrs[attr] = self.attributes[attr][3];
			}

			// check required attrs
			self.requiredAttributes.forEach(function(attr){
				if (attrs[attr] === undefined) {
					valid = new Err.Model(attr + " attribute missing");
					if (self.verbose) console.error('%s attr missing',attr);
				}
			});
		}

		return valid;
	},
	exists : function (id, callback) { var self = this; self.db.objectExists(self.name,id,callback); },
	parse : function (attrs,options) {
		return attrs;
	},
	create : function (attrs, callback) {
		var self = this
			, valid = this.validate(this.parse(attrs,{}),{});
		
		if (valid instanceof Error){ return self.cb(valid, false, callback); }
		if (valid != true) { return self.cb(new Error("invalid attributes for creating " + self.name + " object."),undefined, callback);}
		
		self.db.createObject(self.name, attrs, function(err, object){
			if (err) { return self.cb(err,null,callback); }
			self.emit('created', self.private(object));
			self.cb(null, self.public(object), callback);
		});
		return true;
	},
	read : function(ids, options, callback) {
		var self = this, method;

		if (arguments.length === 2) { callback = options; options = {}; }
		options || (options = {});
		// unless private : true is specified, we read with
		// the public method
		method = (options.private) ? 'private' : 'public';

		// accept an array of model Ids
		if (typeof ids === 'object' && ids.length) {
			var objects = [], count = ids.length;
			options.set = true;
			ids.forEach(function(id){
				self._read(id, options, function(err, object){
					if (err) { count = -1; return self.cb(err, undefined, callback); }
					
					// if the object returns false, we don't want to run it through public/private filter methods
					if (typeof object === 'object') objects.push( self[method](object) );
					else objects.push(object);
					
					if (--count === 0) self.cb(null, objects, callback);
				});
			});
		}
		// or just a single id.
		else self._read(ids, options, function(err, object){ self.cb(err, self[method](object), callback); });

		return this;
	},
	_read : function (id, options, callback) {
		var self = this;

		if (arguments.length === 2) { callback = options; options = {}; }
		options || (options = {});

		self.db.readObject(self.name, id, function(err,object){
			if (err) { return self.cb(err,null,callback); }
			self.parseNumericalAttributes(object);
			self.readOptions(object, options, function(err){
				object = options.private ? self.private(object) : self.public(object);
				self.cb(err, object, callback);
			});
		});
	},
	// called after a single model is read for specific option overriding
	// get references in here, whatever you need to do to flesh out the model
	// modify the model, then invoke done when you're finished (only once!)
	readOptions : function (model,options,done) {
		done();
	},
	update : function (attrs, options, callback) {
		var self = this
			, valid;

		if (typeof options === 'function') { callback = options; options = {}; }
		options || (options = {});

		valid = self.validate(this.parse(attrs,options), { update : true });
		if (!valid || valid instanceof Err.Model){ return self.cb(new Err.Model('invalid update attrs'), false, callback); }

		self._read(attrs.id, function(err, oldObject){
			if (err) { return self.cb(err,null,callback); }
			self.db.updateObject(self.name, attrs.id, attrs, function(err, res){
				if (err) { return self.cb(err,null,callback); }
				self._read(attrs.id,function(err, object){
					if (err) { return self.cb(err,false,callback); }
					if (!options.silent)
						self.emit('updated', self.private(object), self.private(oldObject));
					self.cb(null, self.public(object),callback);
				});
			});
		});
		return true;
	},
	del : function (id, callback) {
		var self = this;
		self.read(id, function(err, object){
			// @todo - support delete multiple.
			self.db.deleteObject(self.name, id, function(err,res){
				if (err) { return self.cb(err,null,callback); }

				self.emit('deleted', self.private(object));
				self.cb(err,res,callback);
			});
		});
		return this;
	},
	count : function (callback) {
		var self = this;
		this.db.get(this.name + '.new', function(err,count){
			if (err) { return self.cb(err,null,callback); }

			if (count) count = parseInt(count, 10);
			self.cb(err,count,callback);
		});
	},
	// Public should be called to package model data for public
	// use. Models passed around by events can carry sensitive stuff
	// and then use format to output
	// * must return the object *
	public : function (attrs) { return attrs; },
	// private does the same thing as public, but for events emitted
	// by the model. useful for adding / setting attributes after
	// create / update / delete
	// * must return the object *
	private : function (attrs) { return attrs; },
	// Use Initialize to set up any model stuff that should be called
	initialize : function (options) {},
	size : function (obj) {
		var size = 0, key;
		for (key in obj)
			if (obj.hasOwnProperty(key)) size++;
		return size;
	},
	allReferences : function (id, callback) {

	},
	getReferences : function (id, referenceName, callback) {
		var self = this;
		if (!self.references[referenceName]) return self.cb(new self.Error("invalid reference name: " + referenceName),false, callback);

		var Model = self.references[referenceName].model;
		self.db.setMembers(self.nameSpace(id) + '.' + Model.name, function(err,references){
			if (err) { return self.cb(err,undefined,callback); }
			if (references.length) {
				references.forEach(function(ref,i){ references[i] = parseInt(ref,10); });
				self.cb(null,references,callback);
			}
			else self.cb(err,undefined,callback);
		});
	},
	readReferences : function (id, referenceName, callback) {
		var self = this;
		self.getReferences(id, referenceName, function (err, refIds) {
			if (err) return self.cb(err,undefined, callback);

			self.references[referenceName].model.read(refIds, function(err, references){
				if (utils.typeOf(references) === 'object') { references = [references];}
				self.cb(err,references, callback);
			});
		});
	},
	referenceExists : function (id, referenceId, referenceName, callback) {
		this.db.setIsMember(this.nameSpace(id) + '.' + referenceName, referenceId, callback);
	},
	addReferenceListeners : function () {
		var self = this;

		for (var refName in this.references) {
			var reference = this.references[refName]
			if (utils.typeOf(reference) !== 'object') throw "references must have an object { model : '', key : ''} as their value";

			if (typeof self[reference.added] === 'function') reference.added = self[reference.added];
			if (typeof self[reference.removed] === 'function') reference.removed = self[reference.added];

			// @todo - make sure Model actually inherits from a Model.
			if (!reference.model || !reference.key) throw "must provide a model and a key for reference : " + refName;

			reference.model.on('created', utils.bind(self.addReference, self, refName, reference) );
			reference.model.on('updated', utils.bind(self.referenceUpdated, self, refName, reference) );
			reference.model.on('deleted', utils.bind(self.removeReference, self, refName, reference) );

		}
	},
	removeReferenceListeners : function () {
		var self = this;
		for (var refName in this.references) {
			var reference = this.references[refName];

			reference.model.off('created', utils.bind(self.addReference, self, refName, reference) );
			reference.model.off('updated', utils.bind(self.referenceUpdated, self, refName, reference) );
			reference.model.off('deleted', utils.bind(self.removeReference, self, refName, reference) );

		}
	},
	_referenceCountName : function (referenceName ) { return referenceName + "Count"; },
	_addReferenceAttributes : function () {
		var self = this;
		for (var refName in this.references) {
			var reference = this.references[refName];
			if (reference.countAttribute) {
				var countAttributeName = self._referenceCountName(refName);
				self.attributes[countAttributeName] || (self.attributes[countAttributeName] = ["number", true, false, 0])
			}
			if (reference.attribute) {
				self.attributes[reference.attribute] || (self.attributes[reference.attribute] = ["number"])
			}
		}
	},
	addReference : function (name, reference, model) {
		var self = this
			, id = model[reference.key]
			, tasks = 1;

		function done () {
			if (--tasks <= 0) {
				if (typeof reference.added === 'function') utils.bind(reference.added, self)(model);
				self.emit('referenceAdded', id, model.id);
			}
		}

		if (!id) return;
		if (reference.countAttribute) { 
			tasks++;
			self.db.hashIncrBy(self.nameSpace(id), self._referenceCountName(name), 1, done); 
		}

		if (reference.attribute){
			tasks++;
			var hash = {};
			hash[reference.attribute] = id;
			self.db.setHash(self.nameSpace(id),hash, done);
		}

		self.db.setAdd(self.nameSpace(id) + '.' + reference.model.name, model.id, function(err){
			if (err) { return; }
			done();
		});
	},
	removeReference : function (name, reference, model) {
		var self = this
			, id = model[reference.key]
			, tasks = 1;
		
		function done () {
			if (--tasks <= 0) {
				if (typeof reference.removed === 'function') utils.bind(reference.removed, self)(model);
				self.emit('referenceRemoved', id, model.id);
			}
		}

		if (!id) return;
		if (reference.countAttribute) {
			tasks++;
			self.db.hashIncrBy(self.nameSpace(id), self._referenceCountName(name), -1, done); 
		}

		if (reference.attribute){
			tasks++;
			self.db.hashDelete(self.nameSpace(id),reference.attribute, done);
		}

		self.db.setRemove(self.nameSpace(id) + '.' + reference.model.name, model.id, function(err){
			if (err) { return; }
			done();
		});
	},
	referenceUpdated : function (name, reference, model, oldModel) {
		// if we've updated with a different parent key,
		// we need to move the reference.
		var self = this
			, id = model[reference.key]
			, oldId = oldModel[reference.key];

		if (!id || !oldId) return;

		if (id !== oldId) {
			self.removeReference(name, reference, oldModel);
			self.addReference(name, reference, model);
		}
	},
	// make sure any attrs delivered as strings are numbers
	parseNumericalAttributes : function (object) {
		for (var attr in object) {
			if (!this.attributes[attr]) { 
				if (this.verbose) console.error('unrecognized stored attribute: ' + this.name + '.' + object.id + " : " + attr);
				delete object.attr;
				continue;
			}
			if (this.attributes[attr][0] === 'number') object[attr] = parseFloat(object[attr],10);
		}
	},
	// inherit utils bind method.
	bind : utils.bind
});

// Model Extend Method.
Model.extend = utils.classExtend;


module.exports = Model;