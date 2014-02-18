var should = require('should')
	, Model = require('../lib/Model')
	, Protocol = require('../lib/Protocol')
	, db = require('ninjazord');

describe('Protocol', function(){

	var TurdJuggler = Protocol.extend({
			name : "turdJuggler",
			methods : {
				juggledTurds : function (turd) {
					this.emit('aTurdHasBeenJuggled', turd);
				},
				turdCreated : function (turd) {
					this.emit('aTurdHasBeenCreated', turd);
				}
			},
			events : {
				"created" : "turdCreated",
				"juggledTurds" : "juggledTurds",
			}
		});

	var TestModel = Model.extend({
				name : "test",
				attributes: {
					body : ['string', true],
					defaultAttr : ['string', true, false, 'Store Me.']
				},
				protocols : [TurdJuggler],
			})
		, model = new TestModel()
		, body = 'test body'
		, createdModelId = undefined;

	before(function(done){
		db.nukeNamespace('tests.', function(){
			db.setPrefix('tests.');
			done();
		});
	});

	describe('abstract Protocol', function(){
		it('should be a protocol object', function(){

		});
		it('should reject objects that aren\'t event emitters as targets', function(){
			try {
				TurdJuggler({});
			} catch (e) {
				e.should.be.a('object');
			}
		});
	});

	describe('extending', function(){

	});

});