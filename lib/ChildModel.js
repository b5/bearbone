// ** Abstract Class Does not export a constructed object**
// @todo - should convert "parentId" to be whatever attribute
// name you'd like to use.
// should have a "parentIdAttribute" that can be set to any attr name,
// and will be made to be required. 
var Model = require('./Model')
	, EventEmitter = require('events').EventEmitter
	, utils = require('./Utils');

var ChildModel = Model.extend({
	constructor : function (options) {
		var self = this
			, name = this.name;

		if (!self.name) throw 'name required for model'; 
		EventEmitter.call(this);

		this.attributes.id || (this.attributes.id = ['number'])
		this.attributes.created || (this.attributes.created = ['number', false, true])
		this.attributes.updated || (this.attributes.updated = ['number', false, true])
		this.attributes.parentModel || (this.attributes.parentModel = ['string', true, true])
		this.attributes.parentId || (this.attributes.parentId = ['number', true, true])

		if(self.externalId) {
			self.create = self._externalCreate;
			// make the id attribute required for creation
			this.attributes.id[1] || (this.attributes.id = ['number', true])
		}
		
		self.setRequiredAttributes.call(self);
		self.initialize.apply(self, options);
	},
	attributes: {
		created: ['number'],
		updated: ['number'],
		parentModel: ['string', true, true],
		parentId: ['number', true, true],
	},
	// set externalId to true if an id needs to be provided for create
	externalId : false,
	parentModel: undefined,
	// @todo - This should filter 'parentModel' to make
	// sure the child can be added.
	acceptedParents : [],
	nameSpace : function (parentModel, parentId) {
		return parentModel + '.' + parentId + '.' + this.name;
	},
	exists : function (parentModel, parentId, id, callback) {
		var self = this;
		self.db.objectExists(self.nameSpace(parentModel, parentId), id, callback);
	},
	parentExists : function (parentModel, parentId, callback) {
		this.db.objectExists(parentModel, parentId, callback);
	},
	initialize: function () {
		
		Model.prototype.initialize.call(this);
	},
	validate : function (attrs, options) {
		var self = this, valid = true, attrType;
		options || (options = {})

		if (!attrs || typeof attrs != 'object') return false;

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

		// Add default if no value is supplied.
		for (var attr in self.attributes) { 
			if ( (self.attributes[attr][3] || self.attributes[attr][3] === 0) && !attrs[attr])
				attrs[attr] = self.attributes[attr][3]; 
		}
		
		if (!options.update) {
			// check required attrs
			self.requiredAttributes.forEach(function(attr){ 
				if (!attrs[attr] && attrs[attr] != 0) { 
					valid = false; 
					if (self.verbose) console.log('%s attr missing',attr); 
				}
			});
		} 
		else if (!attrs.parentModel || !attrs.parentId || !attrs.id) valid = false;

		return valid;
	},
	create : function (attrs, callback) {
		var self = this;

		if (!self.validate(attrs)) return self.cb(false, callback);
		self.parentExists(attrs.parentModel, attrs.parentId, function(exists){
			if (exists)
				self.db.createObject( self.nameSpace(attrs.parentModel, attrs.parentId), attrs, function(object){
					self.emit('created', self.private(object));
					self.cb(self.public(object),callback);
				});
			else { 
				if (self.verbose) console.log('cannot create child model %s, parent %s.%s doesn\'t exist.',self.name, attrs.parentModel, attrs.parentId);
				self.cb(false, callback); 
			}
		});
		return true;
	},
	_externalCreate : function (attrs, callback) {
		var self = this;
		
		if (!self.validate(attrs)) return self.cb(false, callback);
		
		self.parentExists(attrs.parentModel, attrs.parentId, function(exists){
			if (exists)
				self.db.createObjectWithExternalId( self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, attrs, function(object){
					self.emit('created', self.private(object));
					self.cb(self.public(object),callback);
				});
			else { 
				if (self.verbose) console.log('cannot create %s, parent doesn\'t exist.',self.name);
				self.cb(false, callback); 
			}
		});
		return true;
	},
	_read : function (parentModel, parentId, id, options, callback) {
		var self = this;
		self.db.objectExists(self.nameSpace(parentModel, parentId), id, function(exists){
			if (exists) {
				self.db.readObject( self.nameSpace(parentModel, parentId), id, function(childObject){
					if (childObject)
						// convert read out redis numbers to js numbers
						for (var attr in childObject) {
							if (self.attributes[attr][0] === 'number') childObject[attr] = parseFloat(childObject[attr]);
						}

					callback(childObject);
				});
			} else callback(false);
		});
	},
	read : function (attrs, options, callback) {
		var self = this, method;
		
		if (typeof options === 'function') callback = options;
		options || (options = {})
		// unless private : true is specified, we read with 
		// the public method
		method = (options.private) ? 'private' : 'public';

		// accept an array of ids
		if (typeof attrs.id === 'object' && attrs.id.length) {
			var objects = [], count = attrs.id.length;
			attrs.id.forEach(function(id){
				self._read(attrs.parentModel, attrs.parentId, id, options, function(object){
					objects.push(self[method](object));
					if (--count == 0) self.cb(objects, callback);
				});
			});
		} 
		// or just a single id.
		else self._read(attrs.parentModel, attrs.parentId, attrs.id, options, function(object){  object ? self.cb( self[method](object), callback) : self.cb(false, callback); });
	},
	update : function (attrs, callback) {
		var self = this;

		if (!self.validate(attrs, {update: true})) return self.cb(false, callback);

		self.db.updateObject( self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, attrs, function(updatedObject){
			self._read(attrs.parentModel, attrs.parentId, attrs.id, {}, function(object){
				self.emit('updated', self.private(object));
				self.cb(self.public(object), callback);
			});
		});
		return true;
	},
	del : function (attrs, callback) {
		var self = this;
		self.db.deleteObject(self.nameSpace(attrs.parentModel, attrs.parentId), attrs.id, function(response){
			self.emit('deleted', attrs);
			self.cb(response, callback);
		});
	}
});

module.exports = ChildModel;