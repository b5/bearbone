// ** Abstract Class Does not export a Model object**
var db = require('ninjazord')
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
	attributes : {
		id : ['number'],
		created : ['number'],
		updated : ['number']
	},
	cb : utils.cb,
	nameSpace : function (id) { return this.name + '.' + id + '.'; },
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
	validate: function(attrs, options) {
		var self = this, valid = true, attrType;
		options || (options = {})
		if (!attrs || typeof attrs != 'object') return false;
		if (options.update && !attrs.id) return false;

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
					if (self.attributes[attr][0] === 'number') object[attr] = parseFloat(object[attr]);
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
	update : function (attrs, callback) {
		var self = this;
		if (!self.validate(attrs, { update : true })) return self.cb(false, callback);
		self.db.updateObject(self.name, attrs.id, attrs, function(res){
			self.read(attrs.id,function(object){
				if (!object) return self.cb(false, callback);
				self.emit('updated', self.private(object));
				self.cb(self.public(object),callback);
			});
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
	count : function (callback) {
		var self = this;
		this.db.get(this.name + '.new', function(count){
			if (count) count = parseInt(count, 10);
			self.cb(count, callback);
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