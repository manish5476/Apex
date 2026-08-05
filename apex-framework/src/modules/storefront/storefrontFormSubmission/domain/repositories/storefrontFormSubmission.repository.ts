const BaseRepository = require('../../../../../core/BaseRepository');
const StorefrontFormSubmission = require('../../infrastructure/models/storefrontFormSubmission.model');

class StorefrontFormSubmissionRepository extends BaseRepository {
  constructor() {
    super(StorefrontFormSubmission);
  }

  // TODO: add StorefrontFormSubmission-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new StorefrontFormSubmissionRepository();
