var should = require('should')
	, db = require('ninjazord')
	, Sorting = require('../lib/Sorting')
	, EventEmitter = require('events').EventEmitter;


describe('Route Protocol', function (){
	var route
		, Target = new EventEmitter;

	Target.name = "route";

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
				var route = new Sorting({ name : "carl" });
			} catch (err) {
				should.exist(err);
			}
		});
		it('should reject targets without a name', function (){
			try {
				var sorting = new Sorting({});
			} catch (err) {
				should.exist(err);
			}
		});
		it('should accept a proper target', function(){
			route = new Sorting(Target);
			route.should.be.a('object');
			route.target.should.equal(Target);
		});
	});

});