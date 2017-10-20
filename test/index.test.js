'use strict';

var Analytics = require('@plainflow-dcp/analytics.js-core').constructor;
var JSON = require('json3');
var Plainflow = require('../lib/');
var assert = require('proclaim');
var cookie = require('component-cookie');
var integration = require('@segment/analytics.js-integration');
var protocol = require('@segment/protocol');
var sandbox = require('@segment/clear-env');
var store = require('yields-store');
var tester = require('@segment/analytics.js-integration-tester');
var type = require('component-type');
var sinon = require('sinon');

// FIXME(ndhoule): clear-env's AJAX request clearing interferes with PhantomJS 2
// Detect Phantom env and use it to disable affected tests. We should use a
// better/more robust way of intercepting and canceling AJAX requests to avoid
// this hackery
var isPhantomJS = (/PhantomJS/).test(window.navigator.userAgent);

describe('Plainflow', function() {
  var plainflow;
  var analytics;
  var options;

  before(function() {
    // Just to make sure that `cookie()`
    // doesn't throw URIError we add a cookie
    // that will cause `decodeURIComponent()` to throw.
    document.cookie = 'bad=%';
  });

  beforeEach(function() {
    options = { apiKey: 'p1ai2f10w' };
    protocol.reset();
    analytics = new Analytics();
    plainflow = new Plainflow(options);
    analytics.use(Plainflow);
    analytics.use(tester);
    analytics.add(plainflow);
    analytics.assert(Plainflow.global === window);
    resetCookies();
  });

  afterEach(function() {
    analytics.restore();
    analytics.reset();
    resetCookies();
    plainflow.reset();
    sandbox();
  });

  function resetCookies() {
    store('pf:context.referrer', null);
    cookie('pf:context.referrer', null, { maxage: -1, path: '/' });
    store('plainflow_amp_id', null);
    cookie('plainflow_amp_id', null, { maxage: -1, path: '/' });
    store('pfl_xid', null);
    cookie('pfl_xid', null, { maxage: -1, path: '/' });
    store('pfl_xid_fd', null);
    cookie('pfl_xid_fd', null, { maxage: -1, path: '/' });
    store('pfl_xid_ts', null);
    cookie('pfl_xid_ts', null, { maxage: -1, path: '/' });
  }

  it('should have the right settings', function() {
    analytics.compare(Plainflow, integration('Plainflow')
      .option('apiKey', ''));
  });

  it('should always be turned on', function(done) {
    var Analytics = analytics.constructor;
    var ajs = new Analytics();
    ajs.use(Plainflow);
    // eslint-disable-next-line quote-props
    ajs.initialize({ 'Plainflow': options });
    ajs.ready(function() {
      // eslint-disable-next-line
      var plainflow = ajs._integrations['Plainflow'];
      plainflow.ontrack = sinon.spy();
      ajs.track('event', {}, { All: false });
      assert(plainflow.ontrack.calledOnce);
      done();
    });
  });

  describe('Plainflow.storage()', function() {
    it('should return cookie() when the protocol isnt file://', function() {
      analytics.assert(Plainflow.storage(), cookie);
    });

    it('should return store() when the protocol is file://', function() {
      analytics.assert(Plainflow.storage(), cookie);
      protocol('file:');
      analytics.assert(Plainflow.storage(), store);
    });

    it('should return store() when the protocol is chrome-extension://', function() {
      analytics.assert(Plainflow.storage(), cookie);
      protocol('chrome-extension:');
      analytics.assert(Plainflow.storage(), store);
    });
  });

  describe('before loading', function() {
    beforeEach(function() {
      analytics.stub(plainflow, 'load');
    });

    describe('#normalize', function() {
      var object;

      beforeEach(function() {
        plainflow.cookie('pf:context.referrer', null);
        analytics.initialize();
        object = {};
      });

      it('should add .anonymousId', function() {
        analytics.user().anonymousId('anon-id');
        plainflow.normalize(object);
        analytics.assert(object.anonymousId === 'anon-id');
      });

      it('should add .sentAt', function() {
        plainflow.normalize(object);
        analytics.assert(object.sentAt);
        analytics.assert(type(object.sentAt) === 'date');
      });

      it('should add .userId', function() {
        analytics.user().id('user-id');
        plainflow.normalize(object);
        analytics.assert(object.userId === 'user-id');
      });

      it('should not replace the .userId', function() {
        analytics.user().id('user-id');
        object.userId = 'existing-id';
        plainflow.normalize(object);
        analytics.assert(object.userId === 'existing-id');
      });

      it('should always add .anonymousId even if .userId is given', function() {
        var object = { userId: 'baz' };
        plainflow.normalize(object);
        analytics.assert(object.anonymousId.length === 36);
      });

      it('should add .context', function() {
        plainflow.normalize(object);
        analytics.assert(object.context);
      });

      it('should not rewrite context if provided', function() {
        var ctx = {};
        var object = { context: ctx };
        plainflow.normalize(object);
        analytics.assert(object.context === ctx);
      });

      it('should copy .options to .context', function() {
        var opts = {};
        var object = { options: opts };
        plainflow.normalize(object);
        analytics.assert(object.context === opts);
        analytics.assert(object.options == null);
      });

      it('should add .writeKey', function() {
        plainflow.normalize(object);
        analytics.assert(object.writeKey === plainflow.options.apiKey);
      });

      it('should add .messageId', function() {
        plainflow.normalize(object);
        analytics.assert(object.messageId.length === 36);
      });

      it('should properly randomize .messageId', function() {
        var set = {};
        var count = 1000;
        for (var i = 0; i < count; i++) {
          var id = plainflow.normalize(object).messageId;
          set[id] = true;
        }
        analytics.assert(Object.keys(set).length === count);
      });

      it('should add .library', function() {
        plainflow.normalize(object);
        analytics.assert(object.context.library);
        analytics.assert(object.context.library.name === 'pfanalytics.js');
        analytics.assert(object.context.library.version === analytics.VERSION);
      });

      it('should allow override of .library', function() {
        var ctx = {
          library: {
            name: 'analytics-wordpress',
            version: '1.0.3'
          }
        };
        var object = { context: ctx };
        plainflow.normalize(object);
        analytics.assert(object.context.library);
        analytics.assert(object.context.library.name === 'analytics-wordpress');
        analytics.assert(object.context.library.version === '1.0.3');
      });

      it('should add .userAgent', function() {
        plainflow.normalize(object);
        analytics.assert(object.context.userAgent === navigator.userAgent);
      });

      it('should add .campaign', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.search = '?utm_source=source&utm_medium=medium&utm_term=term&utm_content=content&utm_campaign=name';
        Plainflow.global.location.hostname = 'localhost';
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.campaign);
        analytics.assert(object.context.campaign.source === 'source');
        analytics.assert(object.context.campaign.medium === 'medium');
        analytics.assert(object.context.campaign.term === 'term');
        analytics.assert(object.context.campaign.content === 'content');
        analytics.assert(object.context.campaign.name === 'name');
        Plainflow.global = window;
      });

      it('should allow override of .campaign', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.search = '?utm_source=source&utm_medium=medium&utm_term=term&utm_content=content&utm_campaign=name';
        Plainflow.global.location.hostname = 'localhost';
        var object = {
          context: {
            campaign: {
              source: 'overrideSource',
              medium: 'overrideMedium',
              term: 'overrideTerm',
              content: 'overrideContent',
              name: 'overrideName'
            }
          }
        };
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.campaign);
        analytics.assert(object.context.campaign.source === 'overrideSource');
        analytics.assert(object.context.campaign.medium === 'overrideMedium');
        analytics.assert(object.context.campaign.term === 'overrideTerm');
        analytics.assert(object.context.campaign.content === 'overrideContent');
        analytics.assert(object.context.campaign.name === 'overrideName');
        Plainflow.global = window;
      });

      it('should add .referrer.id and .referrer.type', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.search = '?utm_source=source&urid=medium';
        Plainflow.global.location.hostname = 'localhost';
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.referrer);
        analytics.assert(object.context.referrer.id === 'medium');
        analytics.assert(object.context.referrer.type === 'millennial-media');
        Plainflow.global = window;
      });

      it('should add .referrer.id and .referrer.type from cookie', function() {
        plainflow.cookie('pf:context.referrer', '{"id":"baz","type":"millennial-media"}');
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.search = '?utm_source=source';
        Plainflow.global.location.hostname = 'localhost';
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.referrer);
        analytics.assert(object.context.referrer.id === 'baz');
        analytics.assert(object.context.referrer.type === 'millennial-media');
        Plainflow.global = window;
      });

      it('should add .referrer.id and .referrer.type from cookie when no query is given', function() {
        plainflow.cookie('pf:context.referrer', '{"id":"medium","type":"millennial-media"}');
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.search = '';
        Plainflow.global.location.hostname = 'localhost';
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.referrer);
        analytics.assert(object.context.referrer.id === 'medium');
        analytics.assert(object.context.referrer.type === 'millennial-media');
        Plainflow.global = window;
      });

      it('should add .amp.id from store', function() {
        plainflow.cookie('plainflow_amp_id', 'some-amp-id');
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(object.context.amp);
        analytics.assert(object.context.amp.id === 'some-amp-id');
      });

      it('should not add .amp if theres no plainflow_amp_id', function() {
        plainflow.normalize(object);
        analytics.assert(object);
        analytics.assert(object.context);
        analytics.assert(!object.context.amp);
      });

      describe('unbundling', function() {
        var plainflow;

        beforeEach(function() {
          var Analytics = analytics.constructor;
          var ajs = new Analytics();
          plainflow = new Plainflow(options);
          ajs.use(Plainflow);
          ajs.use(integration('other'));
          ajs.add(plainflow);
          ajs.initialize({ other: {} });
        });

        it('should add a list of bundled integrations when `addBundledMetadata` is set', function() {
          plainflow.options.addBundledMetadata = true;
          plainflow.normalize(object);

          assert(object);
          assert(object._metadata);
          assert.deepEqual(object._metadata.bundled, [
            'Plainflow',
            'other'
          ]);
        });

        it('should add a list of unbundled integrations when `addBundledMetadata` and `unbundledIntegrations` are set', function() {
          plainflow.options.addBundledMetadata = true;
          plainflow.options.unbundledIntegrations = [ 'other2' ];
          plainflow.normalize(object);

          assert(object);
          assert(object._metadata);
          assert.deepEqual(object._metadata.unbundled, [ 'other2' ]);
        });

        it('should not add _metadata when `addBundledMetadata` is unset', function() {
          plainflow.normalize(object);

          assert(object);
          assert(!object._metadata);
        });
      });
    });
  });

  describe('after loading', function() {
    beforeEach(function(done) {
      analytics.once('ready', done);
      analytics.initialize();
      analytics.page();
    });

    describe('#page', function() {
      beforeEach(function() {
        analytics.stub(plainflow, 'enqueue');
      });

      it('should enqueue section, name and properties', function() {
        analytics.page('section', 'name', { property: true }, { opt: true });
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/p');
        analytics.assert(args[1].name === 'name');
        analytics.assert(args[1].category === 'section');
        analytics.assert(args[1].properties.property === true);
        analytics.assert(args[1].context.opt === true);
        analytics.assert(args[1].timestamp);
      });
    });

    describe('#identify', function() {
      beforeEach(function() {
        analytics.stub(plainflow, 'enqueue');
      });

      it('should enqueue an id and traits', function() {
        analytics.identify('id', { trait: true }, { opt: true });
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/i');
        analytics.assert(args[1].userId === 'id');
        analytics.assert(args[1].traits.trait === true);
        analytics.assert(args[1].context.opt === true);
        analytics.assert(args[1].timestamp);
      });
    });

    describe('#track', function() {
      beforeEach(function() {
        analytics.stub(plainflow, 'enqueue');
      });

      it('should enqueue an event and properties', function() {
        analytics.track('event', { prop: true }, { opt: true });
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/t');
        analytics.assert(args[1].event === 'event');
        analytics.assert(args[1].context.opt === true);
        analytics.assert(args[1].properties.prop === true);
        analytics.assert(args[1].traits == null);
        analytics.assert(args[1].timestamp);
      });
    });

    describe('#group', function() {
      beforeEach(function() {
        analytics.stub(plainflow, 'enqueue');
      });

      it('should enqueue groupId and traits', function() {
        analytics.group('id', { trait: true }, { opt: true });
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/g');
        analytics.assert(args[1].groupId === 'id');
        analytics.assert(args[1].context.opt === true);
        analytics.assert(args[1].traits.trait === true);
        analytics.assert(args[1].timestamp);
      });
    });

    describe('#alias', function() {
      beforeEach(function() {
        analytics.stub(plainflow, 'enqueue');
      });

      it('should enqueue .userId and .previousId', function() {
        analytics.alias('to', 'from');
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/a');
        analytics.assert(args[1].previousId === 'from');
        analytics.assert(args[1].userId === 'to');
        analytics.assert(args[1].timestamp);
      });

      it('should fallback to user.anonymousId if .previousId is omitted', function() {
        analytics.user().anonymousId('anon-id');
        analytics.alias('to');
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/a');
        analytics.assert(args[1].previousId === 'anon-id');
        analytics.assert(args[1].userId === 'to');
        analytics.assert(args[1].timestamp);
      });

      it('should fallback to user.anonymousId if .previousId and user.id are falsey', function() {
        analytics.alias('to');
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/a');
        analytics.assert(args[1].previousId);
        analytics.assert(args[1].previousId.length === 36);
        analytics.assert(args[1].userId === 'to');
      });

      it('should rename `.from` and `.to` to `.previousId` and `.userId`', function() {
        analytics.alias('user-id', 'previous-id');
        var args = plainflow.enqueue.args[0];
        analytics.assert(args[0] === '/a');
        analytics.assert(args[1].previousId === 'previous-id');
        analytics.assert(args[1].userId === 'user-id');
        analytics.assert(args[1].from == null);
        analytics.assert(args[1].to == null);
      });
    });

    describe('#enqueue', function() {
      beforeEach(function() {
        analytics.spy(plainflow, 'session');
      });

      it('should use https: protocol when http:', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('http:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://pipe.plainflow.net/v1/i');
      }));

      it('should use https: protocol when https:', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('https:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://pipe.plainflow.net/v1/i');
      }));

      it('should use https: protocol when https:', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('file:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://pipe.plainflow.net/v1/i');
      }));

      it('should use https: protocol when chrome-extension:', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('chrome-extension:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://pipe.plainflow.net/v1/i');
      }));

      it('should enqueue to `pipe.plainflow.net/v1` by default', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('https:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://pipe.plainflow.net/v1/i');
      }));

      it('should enqueue to `options.apiHost` when set', sinon.test(function() {
        plainflow.options.apiHost = 'api.example.com';

        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        protocol('https:');
        plainflow.enqueue('/i', { userId: 'id' });

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(req.url, 'https://api.example.com/i');
      }));

      it('should enqueue a normalized payload', sinon.test(function() {
        var xhr = sinon.useFakeXMLHttpRequest();
        var spy = sinon.spy();
        xhr.onCreate = spy;

        var payload = {
          key1: 'value1',
          key2: 'value2'
        };

        plainflow.normalize = function() { return payload; };

        plainflow.enqueue('/i', {});

        assert(spy.calledOnce);
        var req = spy.getCall(0).args[0];
        assert.strictEqual(JSON.parse(req.requestBody).key1, 'value1');
        assert.strictEqual(JSON.parse(req.requestBody).key2, 'value2');
      }));
    });

    // FIXME(ndhoule): See note at `isPhantomJS` definition
    (isPhantomJS ? xdescribe : describe)('e2e tests — without queueing', function() {
      beforeEach(function() {
        plainflow.options.retryQueue = false;
      });

      describe('/g', function() {
        it('should succeed', function(done) {
          plainflow.enqueue('/g', { groupId: 'gid', userId: 'uid' }, function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
        });
      });

      describe('/p', function() {
        it('should succeed', function(done) {
          var data = { userId: 'id', name: 'page', properties: {} };
          plainflow.enqueue('/p', data, function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
        });
      });

      describe('/a', function() {
        it('should succeed', function(done) {
          var data = { userId: 'id', from: 'b', to: 'a' };
          plainflow.enqueue('/a', data, function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
        });
      });

      describe('/t', function() {
        it('should succeed', function(done) {
          var data = { userId: 'id', event: 'my-event', properties: {} };

          plainflow.enqueue('/t', data, function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
        });
      });

      describe('/i', function() {
        it('should succeed', function(done) {
          var data = { userId: 'id' };

          plainflow.enqueue('/i', data, function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
        });
      });
    });

    (isPhantomJS ? xdescribe : describe)('e2e tests — with queueing', function() {
      beforeEach(function() {
        plainflow.options.retryQueue = true;
        analytics.initialize();
      });

      describe('/g', function() {
        it('should succeed', function(done) {
          plainflow._lsqueue.on('processed', function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
          plainflow.enqueue('/g', { groupId: 'gid', userId: 'uid' });
        });
      });

      describe('/p', function() {
        it('should succeed', function(done) {
          plainflow._lsqueue.on('processed', function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
          plainflow.enqueue('/p', { userId: 'id', name: 'page', properties: {} });
        });
      });

      describe('/a', function() {
        it('should succeed', function(done) {
          plainflow._lsqueue.on('processed', function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
          plainflow.enqueue('/a', { userId: 'id', from: 'b', to: 'a' });
        });
      });

      describe('/t', function() {
        it('should succeed', function(done) {
          plainflow._lsqueue.on('processed', function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
          plainflow.enqueue('/t', { userId: 'id', event: 'my-event', properties: {} });
        });
      });

      describe('/i', function() {
        it('should succeed', function(done) {
          plainflow._lsqueue.on('processed', function(err, res) {
            if (err) return done(err);
            analytics.assert(JSON.parse(res.responseText).success);
            done();
          });
          plainflow.enqueue('/i', { userId: 'id' });
        });
      });
    });

    describe('#cookie', function() {
      beforeEach(function() {
        plainflow.cookie('foo', null);
      });

      it('should persist the cookie even when the hostname is "dev"', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.href = 'https://dev:300/path';
        analytics.assert(plainflow.cookie('foo') == null);
        plainflow.cookie('foo', 'bar');
        analytics.assert(plainflow.cookie('foo') === 'bar');
        Plainflow.global = window;
      });

      it('should persist the cookie even when the hostname is "127.0.0.1"', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.href = 'http://127.0.0.1:3000/';
        analytics.assert(plainflow.cookie('foo') == null);
        plainflow.cookie('foo', 'bar');
        analytics.assert(plainflow.cookie('foo') === 'bar');
        Plainflow.global = window;
      });

      it('should persist the cookie even when the hostname is "app.herokuapp.com"', function() {
        Plainflow.global = { navigator: {}, location: {} };
        Plainflow.global.location.href = 'https://app.herokuapp.com/about';
        Plainflow.global.location.hostname = 'app.herokuapp.com';
        analytics.assert(plainflow.cookie('foo') == null);
        plainflow.cookie('foo', 'bar');
        analytics.assert(plainflow.cookie('foo') === 'bar');
        Plainflow.global = window;
      });
    });

    describe('#crossDomainId', function() {
      var server;

      beforeEach(function() {
        server = sinon.fakeServer.create();
        plainflow.options.crossDomainIdServers = [
          'userdata.example1.com',
          'xid.domain2.com',
          'localhost'
        ];
        analytics.stub(plainflow, 'onidentify');
      });

      afterEach(function() {
        server.restore();
      });

      it('should not crash with invalid config', function() {
        plainflow.options.crossDomainIdServers = undefined;

        var res = null;
        var err = null;
        plainflow.retrieveCrossDomainId(function(error, response) {
          res = response;
          err = error;
        });

        analytics.assert(!res);
        analytics.assert(err === 'crossDomainId not enabled');
      });

      it('should generate xid locally if there is only one (current hostname) server', function() {
        plainflow.options.crossDomainIdServers = [
          'localhost'
        ];

        var res = null;
        plainflow.retrieveCrossDomainId(function(err, response) {
          res = response;
        });

        var identify = plainflow.onidentify.args[0];
        var crossDomainId = identify[0].traits().crossDomainId;
        analytics.assert(crossDomainId);

        analytics.assert(res.crossDomainId === crossDomainId);
        analytics.assert(res.fromDomain === 'localhost');
      });

      it('should obtain crossDomainId', function() {
        var res = null;
        plainflow.retrieveCrossDomainId(function(err, response) {
          res = response;
        });
        server.respondWith('GET', 'https://xid.domain2.com/v1/id/' + plainflow.options.apiKey, [
          200,
          { 'Content-Type': 'application/json' },
          '{ "id": "xdomain-id-1" }'
        ]);
        server.respond();

        var identify = plainflow.onidentify.args[0];
        analytics.assert(identify[0].traits().crossDomainId === 'xdomain-id-1');

        analytics.assert(res.crossDomainId === 'xdomain-id-1');
        analytics.assert(res.fromDomain === 'xid.domain2.com');
      });

      it('should generate crossDomainId if no server has it', function() {
        var res = null;
        plainflow.retrieveCrossDomainId(function(err, response) {
          res = response;
        });

        server.respondWith('GET', 'https://xid.domain2.com/v1/id/' + plainflow.options.apiKey, [
          200,
          { 'Content-Type': 'application/json' },
          '{ "id": null }'
        ]);
        server.respondWith('GET', 'https://userdata.example1.com/v1/id/' + plainflow.options.apiKey, [
          200,
          { 'Content-Type': 'application/json' },
          '{ "id": null }'
        ]);
        server.respond();

        var identify = plainflow.onidentify.args[0];
        var crossDomainId = identify[0].traits().crossDomainId;
        analytics.assert(crossDomainId);

        analytics.assert(res.crossDomainId === crossDomainId);
        analytics.assert(res.fromDomain === 'localhost');
      });

      it('should bail if all servers error', function() {
        var err = null;
        var res = null;
        plainflow.retrieveCrossDomainId(function(error, response) {
          err = error;
          res = response;
        });

        server.respondWith('GET', 'https://xid.domain2.com/v1/id/' + plainflow.options.apiKey, [
          500,
          { 'Content-Type': 'application/json' },
          ''
        ]);
        server.respondWith('GET', 'https://userdata.example1.com/v1/id/' + plainflow.options.apiKey, [
          500,
          { 'Content-Type': 'application/json' },
          ''
        ]);
        server.respond();

        var identify = plainflow.onidentify.args[0];
        analytics.assert(!identify);
        analytics.assert(!res);
        analytics.assert(err === 'Internal Server Error');
      });

      it('should bail if some servers fail and others have no xid', function() {
        var err = null;
        var res = null;
        plainflow.retrieveCrossDomainId(function(error, response) {
          err = error;
          res = response;
        });

        server.respondWith('GET', 'https://xid.domain2.com/v1/id/' + plainflow.options.apiKey, [
          400,
          { 'Content-Type': 'application/json' },
          ''
        ]);
        server.respondWith('GET', 'https://userdata.example1.com/v1/id/' + plainflow.options.apiKey, [
          200,
          { 'Content-Type': 'application/json' },
          '{ "id": null }'
        ]);
        server.respond();

        var identify = plainflow.onidentify.args[0];
        analytics.assert(!identify);
        analytics.assert(!res);
        analytics.assert(err === 'Bad Request');
      });

      it('should succeed even if one server fails', function() {
        var err = null;
        var res = null;
        plainflow.retrieveCrossDomainId(function(error, response) {
          err = error;
          res = response;
        });

        server.respondWith('GET', 'https://xid.domain2.com/v1/id/' + plainflow.options.apiKey, [
          500,
          { 'Content-Type': 'application/json' },
          ''
        ]);
        server.respondWith('GET', 'https://userdata.example1.com/v1/id/' + plainflow.options.apiKey, [
          200,
          { 'Content-Type': 'application/json' },
          '{ "id": "xidxid" }'
        ]);
        server.respond();

        var identify = plainflow.onidentify.args[0];
        analytics.assert(identify[0].traits().crossDomainId === 'xidxid');

        analytics.assert(res.crossDomainId === 'xidxid');
        analytics.assert(res.fromDomain === 'userdata.example1.com');
        analytics.assert(!err);
      });
    });
  });

  describe('localStorage queueing', function() {
    beforeEach(function(done) {
      if (window.localStorage) {
        window.localStorage.clear();
      }
      analytics.once('ready', done);
      plainflow.options.retryQueue = true;
      analytics.initialize();
    });

    afterEach(function() {
      plainflow._lsqueue.stop();
    });

    it('#enqueue should add to the retry queue', function() {
      analytics.stub(plainflow._lsqueue, 'addItem');
      plainflow.enqueue('/i', { userId: '1' });
      assert(plainflow._lsqueue.addItem.calledOnce);
    });

    it('should send requests', function() {
      var xhr = sinon.useFakeXMLHttpRequest();
      var spy = sinon.spy();
      xhr.onCreate = spy;

      plainflow.enqueue('/i', { userId: '1' });

      assert(spy.calledOnce);
      var req = spy.getCall(0).args[0];
      var body = JSON.parse(req.requestBody);
      assert.equal(body.userId, '1');
    });
  });
});
