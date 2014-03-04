var Protocol = require('./Protocol')
  , completer = require('./Autocompleter')
  , db = require('ninjazord')
  , _ = require('underscore');

/* ------- * Autocompletion * ------- */
// autocompletion is used by setting the completions hash
// largely so that we get stuff like the search method.
var Autocomplete = Protocol.extend({
  name : 'autocomplete',
  initialize : function () {
    this.completions = this.target.completions || [];

    this._completer.applicationPrefix( db.getPrefix() + 'completions');

    if (this.checkCompletions()) {
      this.addCompletions();
    }
    return Protocol.prototype.initialize.call(this);
  },
  completions : undefined,
  methods : {
    search : function (query,count,callback) { this.autocomplete(query,count,callback); },
  },
  nameSpace : function (name) { return this.target.name + "." + name; },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
  // export the raw completer. Probaly shouldn't be used
  // outside the controller.
  _completer : completer,
  // prefix for completer namespace
  _completerPrefix : function () { return this.target.name + ':'; },
  // add an attribute as the key, with a value of a number from 0-99 to
  // indicate the weight of the attribute against the others.
  // eg. { name : 99 }
  completions : {},
  checkCompletions : function () {
    var self = this,
        clean = true,
        key, val;

    if (!self.completions instanceof Array) { return false; }
    if (!self.completions.length) { return false; }

    for (key in self.completions) {
      val = self.completions[key];
      if (typeof val != 'number') {
        console.error('%s autocomplete attribute %s needs a 0-99 number as it\'s value',self.target.name,key);
        clean = false;
        continue;
      } else if (val < 0 || val > 99) {
        console.error('%s autocomplete attribute %s is not a number between 0 and 99',self.target.name, key);
        clean = false;
        continue;
      }
    }

    return clean;
  },
  addCompletions : function(callback){
    var self = this, count;
    self.target.get('all', function(err, models){
      if (err || !models instanceof Array ) { return self.cb(err, undefined, callback); }
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
    if (typeof count === "function") { callback = count; count = 99; }
    self._completer.search(self._completerPrefix() + query, count, function(err,results){
      if (err) { return self.cb(err,null,callback); }
      if (results.length) {
        results.forEach(function(r,i){ results[i] = parseInt(r.split(':')[0], 10); });
        results = _.uniq(results);
        if (typeof self.target.read === "function") {
            self.target.read(results, { array : true }, function(err, models){
              if (err) { return self.cb(err, undefined, callback); }
              if (!models instanceof Array) { models = [models]; }
              self.cb(null, models, callback);
            });
        } else {
          self.cb(null, results, callback);
        }
      } else self.cb(null, [], callback);
    });
  },
});

module.exports = Autocomplete;