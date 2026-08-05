const BaseRepository = require('../../../../../core/BaseRepository');
const TransferRequest = require('../../infrastructure/models/transferRequest.model');

class TransferRequestRepository extends BaseRepository {
  constructor() {
    super(TransferRequest);
  }

  // TODO: add TransferRequest-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new TransferRequestRepository();
