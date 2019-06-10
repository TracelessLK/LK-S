const request = require('supertest');

describe('Ping Tests', function() {
    it('Ping Tests', function(done) {
        request("http://localhost:3000")
            .get('/ping')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/)
            .expect(200, done);
    });
});



