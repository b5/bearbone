var Protocol = require('./Protocol')
  , db = require('ninjazord')
  , _ = require('underscore');

/* ------ * Indexes * ------ */
// Indexes are reverse-lookups. They will store a model
// attribute & give back the id.
// works exlusively with the find command.
// indexed attributes MUST be unique
// eg. indexes : ['username','email']
var Index = Protocol.extend({
  name : "index",
  initialize : function (Target) {
    if (!Target.name) { throw "relationships target object must have a name"; }
    this.indexes = Target.indexes;

  },
  indexes : undefined,
  nameSpace : function (name) { return this.target.name + "." + name; },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
  indexName : function (name) { return this.target.name + '.index.' + name; },
  add : function (object, callback) {
    if (!this.indexes) return callback();
    var self = this, count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (object[index]) {
        var entry = {};
        entry[object[index]] = object.id;
        db.setHash(self.indexName(index), entry, function(err){
          if (--count === 0) callback();
        }); 
      } else if (--count === 0) callback();
    });
  },
  remove : function (object, callback) {
    if (!this.indexes) return callback();
    var self = this, count = self.indexes.length;
    self.indexes.forEach(function(index){
      if (object[index]) {
        db.hashDelete(self.indexName(index), object[index], function(err){
          if (err) { return self.cb(err,null,callback); }
          if (--count === 0) callback();
        });
      } else if (--count === 0) callback();
    });
  },
});

module.exports = Index;