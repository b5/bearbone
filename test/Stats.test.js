var should = require('should')
	, db = require('ninjazord')
	, Stats = require('../lib/Stats')
	, EventEmitter = require('events').EventEmitter;


describe('Stats Protocol', function (){
	var stats
		, Target = new EventEmitter;

	Target.name = "stats";
	Target.completions = { name : 99, email : 50, category : 20 };

	before(function(done){
		// testModel.verbose = true;
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			done();
		});
	});

	describe('construction', function (){
		it('should reject non-EventEmitter targets', function(){
			try {
				var stats = new Stats({ name : "carl" });
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should reject targets without a name', function (){
			try {
				new Stats({});
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should accept a proper target', function(){
			stats = new Stats(Target);
			stats.should.be.a('object');
			stats.target.should.equal(Target);
		});
	});

	describe('reporting', function(){
		// it('should take a counts array that tracks stats', function(){};
		// @todo - flesh out these tests.
		it('should have a get stats method', function(done){
			Target.report.should.be.a('function');
			Target.report(function(err,stats){
				should.not.exist(err);
				stats.should.be.a('object');
				done();
			});
		});
	});

});