// ** Abstract Class Does not export a Model object**
var db = require('ninjazord')
	, utils = require('./Utils')
	, EventEmitter = require('events').EventEmitter;

// @todo - add an option to storedAttributes that specifies
// that they must be unique.

var Model = function (options) {
	var self = this
		, name = this.name;

	if (!self.name) throw 'name required for model'; 
	EventEmitter.call(this);

	this.storedAttributes.id || (this.storedAttributes.id = ['number'])
	this.storedAttributes.created || (this.storedAttributes.created = ['number', false, true])
	this.storedAttributes.updated || (this.storedAttributes.updated = ['number', false, true])
	
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
	// This dictates what attributes get stored on the model
	// attribute : [ typeof , (requiredForCreation), (private), (defaultVal) ]
	// defaults : [ 'string', false, false, undefined ]
	storedAttributes : {
		id : ['number'],
		created : ['number'],
		updated : ['number']
	},
	cb : utils.cb,
	nameSpace : function (id) { return this.name + '.' + id + '.'; },
	setRequiredAttributes : function () {
		var self = this, requiredAttributes = [];
		for (var attr in self.storedAttributes) {
			if (self.storedAttributes[attr][1]) requiredAttributes.push(attr);
		}
		self.requiredAttributes = requiredAttributes;
	},
	// @todo
	setUniqueAttributes : function () {

	},
	validate: function(attrs, options) {
		var self = this, valid = true;
		if (!attrs || typeof attrs != 'object') return false;
		options || (options = {})

		for (var attr in attrs) {
			if (!self.storedAttributes[attr]) delete attrs[attr];
			else if (typeof attrs[attr] != self.storedAttributes[attr][0]) delete attrs[attr];
		}

		if (!options.update){
			// Add default if no value is supplied.
			for (attr in self.storedAttributes) {
				if ( (self.storedAttributes[attr][3] !== undefined) && attrs[attr] === undefined)
					attrs[attr] = self.storedAttributes[attr][3];
			}

			// check required attrs
			self.requiredAttributes.forEach(function(attr){
				if (attrs[attr] === undefined) {
					valid = false;
					if (self.verbose) console.log('%s attr missing',attr);
				}
			});
		}

		return valid;
	},
	exists : function (id, callback) { var self = this; db.objectExists(self.name,id,callback); },
	create : function (attrs, callback) {
		var self = this;
		if (!this.validate(attrs)){ return self.cb(false, callback); }
		db.createObject(self.name, attrs, function(object){
			self.emit('created', self.private(object));
			self.cb(self.public(object), callback);
		});
		return true;
	},
	_read : function (id, options, callback) {
		var self = this;
		db.readObject(self.name, id, function(object){
			if (object)
				// convert read out redis numbers to js numbers
				for (var attr in object) {
					if (self.storedAttributes[attr][0] === 'number') object[attr] = parseFloat(object[attr]);
				}
			self.cb(object, callback);
		});
	},
	read : function(ids, options, callback) {
		var self = this, method;

		if (typeof options === 'function') callback = options;
		options || (options = {})
		// unless private : true is specified, we read with
		// the public method
		method = (options.private) ? 'private' : 'public';

		// accept an array of model Ids
		if (typeof ids === 'object' && ids.length) {
			var objects = [], count = ids.length;
			options.set = true;
			ids.forEach(function(id){
				self._read(id, options, function(object){
					if (object) objects.push( self[method](object) );
					// if the object returns false, we don't want to run it through public/private filter methods
					else objects.push(object);
					if (--count === 0) self.cb(objects, callback);
				});
			});
		}
		// or just a single id.
		else self._read(ids, options, function(object){ self.cb( self[method](object), callback); });

		return this;
	},
	update : function (id, attrs, callback) {
		var self = this;
		if (!self.validate(attrs, { update : true })) return self.cb(false, callback);
		self.exists(id, function(exists){
			if (exists)
				db.updateObject(self.name, id, attrs, function(res){
					self.read(id,function(object){
						if (!object) return false;
						self.emit('updated', self.private(object));
						self.cb(self.public(object),callback);
					});
				});
			else self.cb(false, callback);
		});
		return true;
	},
	del : function (id, callback) {
		var self = this;
		self.read(id, function(object){
			self.db.deleteObject(self.name, id, function(res){
				self.emit('deleted', self.private(object));
				self.cb(res,callback);
			});
		});
		return this;
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
	// inherit utils bind method.
	bind : utils.bind
});

// Model Extend Method.
Model.extend = utils.classExtend;


// for later
/*
	// later we want to be able to return to the Member model and ask
	// "did you make this!?". Without putting methods on that object.
	// So for that we make an internal object "model"
	function Model (attrs) {
		var self = this;
		for (var attr in attrs ) {
			self[attr] = attrs[attr];
		}
		return self;
	}
	//and have the format method return an instance of "Model"
	function format (member, user) {
		if (typeof member.id != 'number') member.id = parseInt(member.id);
		member.type = 'member';
		if (user) {
			member.username = user.username;
			member.profilePhoto = user.profilePhoto;
		}
		return new Model(member);
	}
	// and add an "instanceOf" method that checks agains this internal method
	Member.prototype.instanceOf = function (obj) {
		return (obj instanceof Model) ? true : false;
	}
*/

module.exports = Model;