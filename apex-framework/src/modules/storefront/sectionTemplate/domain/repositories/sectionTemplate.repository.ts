const BaseRepository = require('../../../../../core/BaseRepository');
const SectionTemplate = require('../../infrastructure/models/sectionTemplate.model');

class SectionTemplateRepository extends BaseRepository {
  constructor() {
    super(SectionTemplate);
  }

  // TODO: add SectionTemplate-specific query methods here, e.g.
  // async findByCode(code) { return this.model.findOne({ code }); }
}

module.exports = new SectionTemplateRepository();
