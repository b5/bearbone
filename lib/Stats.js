var Protocol = require('./Protocol')
  , Err = require('./Err')
  , db = require('ninjazord')
  , _ = require('underscore');


/* ------ * Stats * ------ */
// add any attribute names here to track counts on their differences.

var Stats = Protocol.extend({
  name : "stats",
  initialize : function (Target) {
    if (!Target.name) { throw "relationships target object must have a name"; }
    this.trackedAttributes = Target.trackedAttributes || [];
    this._validateTrackedAttributes();
  },
  trackedAttributes : undefined,
  methods : {
    report : function (options, callback) { this.report(options,callback); }
  },
  report : function (options, callback) {
    var self = this, stats = {}, tasks = 2 + this.trackedAttributes.length;

    if (typeof options === "function") { callback = options; options = {}; }
    options || (options = {});

    function done(){ if (--tasks === 0) return self.cb(null, stats, callback); }
    function error(err){ tasks = -1; return self.cb(err, undefined, callback); }

    db.get(self.target.name + '.stats.count', function(err, count){
      if (err) { return error(err); }
      stats.count = parseInt(count, 10);
      done();
    });

    db.sortedSetRange(self.target.name + '.stats.dailies', 0, -1, true, function(err, set){
      if (err) { return error(err); }
      for (var i = 1; i < set.length; i = i + 2) {
        var num = parseInt(set[i], 10);
        if (!isNaN(num)) { set[i] = num; }
      }
      stats.dailies = set;
      done();
    });

    self.trackedAttributes.forEach(function(attr){
      db.getHash(self.target.name + '.stats.' + attr, function(err, counts){
        if (err) { return error(err); }
        for (var val in counts) {
          counts[val] = parseInt(counts[val], 10);
        }
        stats[attr] = counts;
        done();
      });
    });
  },
  add : function (object) {
    var self = this
      , day = self.todayDate(new Date(parseInt(object.created,10))).valueOf();

    db.incr(self.target.name + '.stats.count');
    db.sortedSetIncrBy(self.target.name + '.stats.dailies',1,day);

    self.trackedAttributes.forEach(function(attr){
      if (object[attr]) db.hashIncrBy(self.target.name + '.stats.' + attr,object[attr], 1);
    });
  },
  update : function (object, oldObject) {
    var self = this;
    self.trackedAttributes.forEach(function(attr){
      if (oldObject[attr]) db.hashIncrBy(self.target.name + '.stats.' + attr, oldObject[attr], -1);
      if (object[attr]) db.hashIncrBy(self.target.name + '.stats.' + attr, object[attr], 1);
    });
  },
  remove : function (object) {
    var self = this
      , day = self.todayDate(new Date(parseInt(object.created,10))).valueOf();
    db.decr(self.target.name + '.stats.count');
    db.sortedSetIncrBy(self.target.name + '.stats.dailies', -1, day);

    self.trackedAttributes.forEach(function(attr){
      if (object[attr]) db.hashIncrBy(self.target.name + '.stats.' + attr,object[attr], -1);
    });
  },
  _validateTrackedAttributes : function () {
    var self = this;
    self.trackedAttributes.forEach(function(attr){
      if (!self.target.model.attributes[attr]) { throw new Err.ConfigError( "'" + attr + "' attribute Specified for tracking does not exist on " + self.target.model.name + " model."); }
    });
  },
  todayDate : function (date) {
    date || (date = new Date());
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  },
  nameSpace : function (name) { return this.target.name + "." + name; },
  // callback utility to only call back if the function exists.
  cb : function (err, res, callback) {
    return (typeof callback === 'function') ? callback(err, res) : false;
  },
});

module.exports = Stats;