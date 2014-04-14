var should = require('should')
	, db = require('ninjazord')
	, Sorting = require('../lib/Sorting')
	, EventEmitter = require('events').EventEmitter;


describe('Sorting Protocol', function (){
	var sorting
		, Target = new EventEmitter;

	Target.name = "sorting";
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
				var sorting = new Sorting({ name : "carl" });
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
			sorting = new Sorting(Target);
			sorting.should.be.a('object');
			sorting.target.should.equal(Target);
		});
	});

	describe.skip('Indexes', function(){
		before(function(done){
			testController.create({ title : 'kickass', body : 'no body!'}, function(err, newObject){
				done();
			});
		});

		it('should have a find method', function(done){
			testController.find('kickass',function(err, object){
				object.length.should.equal(1);
				object[0].should.be.a('object');
				done();
			});
		});
	});

});