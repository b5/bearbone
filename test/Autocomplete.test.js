var should = require('should')
	, db = require('ninjazord')
	, Autocomplete = require('../lib/Autocomplete')
	, EventEmitter = require('events').EventEmitter;


describe('Autocomplete Protocol', function (){
	var completer
		, Target = new EventEmitter;

	Target.name = "autocomplete";
	Target.completions = { name : 99, email : 50, category : 20 };

	var indexes = [
			{ id : 1, name : "abcd", email : "jklmno", category : "beans" },
			{ id : 2, name : "hijk", email : "jklmno", category : "beans" },
			{ id : 3, name : "lmno", email : "jklmno", category : "beans" },
			{ id : 4, name : "pqrs", email : "jklmno", category : "beans" },
			{ id : 5, name : "tuvw", email : "jklmno", category : "beans" },
			{ id : 6, name : "xyz", email : "jklmno", category : "beans" },
		];

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
				var completer = new Autocomplete({ name : "carl" });
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should reject targets without a name', function (){
			try {
				new Autocomplete({});
			} catch (err) {
				err.should.be.a("string");
			}
		});
		it('should accept a proper target', function(){
			completer = new Autocomplete(Target);
			completer.should.be.a('object');
			completer.target.should.equal(Target);
		});
	});

	describe('indexing', function(){
		before(function(){
			// fake "get" function
			Target.get = function (name, callback) {
				callback(null,indexes);
			};
		});

		it('add completions', function(done){
			Target.autocomplete.addCompletions.should.be.a('function');
			Target.autocomplete.addCompletions(function(err){
				should.not.exist(err);
				done();
			});
		});
	});

	describe('target methods', function (){
		it('search', function(done){
			Target.search.should.be.a('function');
			Target.search('abc',function(err, completions){
				should.not.exist(err);
				completions.should.be.a('object');
				completions.length.should.be.a('number');
				completions[0].should.be.a('number');
				done();
			});
		});

		it('read search', function(done){
			Target.read = function (id, options, callback) {
				var res = (id instanceof Array) ? indexes : indexes[+id + 1];
				callback(null, res); 
			}
			Target.search('abc',function(err, completions){
				should.not.exist(err);
				completions.should.be.a('object');
				completions.length.should.be.a('number');
				completions[0].should.be.a('object');
				done();
			});
		});
	});
});