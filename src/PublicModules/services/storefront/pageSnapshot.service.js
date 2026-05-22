'use strict';

const { StorefrontPage, StorefrontPageSnapshot } = require('../../models/storefront/index');
const LayoutService = require('./layout.service');
const StorefrontCache = require('./cacheInvalidation.service');

class PageSnapshotService {
  async buildForPage(organizationId, pageId, options = {}) {
    const page = await StorefrontPage.findOne({
      _id: pageId,
      organizationId,
      isPublished: true,
      status: 'published'
    }).lean();

    if (!page) {
      await this.deleteForPage(organizationId, pageId, options);
      return null;
    }

    const layout = await LayoutService.getLayout(organizationId);
    const snapshotPayload = {
      organizationId,
      pageId: page._id,
      name: page.name,
      slug: page.slug,
      pageType: page.pageType,
      sections: page.sections ?? [],
      seo: page.seo ?? {},
      themeOverride: page.themeOverride ?? {},
      layout: {
        header: layout.header ?? [],
        footer: layout.footer ?? [],
        globalSettings: layout.globalSettings ?? {},
        version: layout.version ?? 1
      },
      isHomepage: page.isHomepage === true,
      pageVersion: page.version ?? 1,
      layoutVersion: layout.version ?? 1,
      publishedAt: page.publishedAt ?? new Date(),
      sourceUpdatedAt: page.updatedAt
    };

    const snapshot = await StorefrontPageSnapshot.findOneAndUpdate(
      { organizationId, pageId: page._id },
      { $set: snapshotPayload },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    if (snapshot.isHomepage) {
      await StorefrontPageSnapshot.updateMany(
        { organizationId, _id: { $ne: snapshot._id } },
        { $set: { isHomepage: false } }
      );
    }

    if (options.invalidate !== false) {
      await StorefrontCache.invalidateStore(organizationId);
    }
    return snapshot;
  }

  async buildAllForStore(organizationId) {
    const pages = await StorefrontPage.find({
      organizationId,
      isPublished: true,
      status: 'published'
    }).select('_id').lean();

    const snapshots = [];
    for (const page of pages) {
      snapshots.push(await this.buildForPage(organizationId, page._id, { invalidate: false }));
    }
    await StorefrontCache.invalidateStore(organizationId);
    return snapshots.filter(Boolean);
  }

  async deleteForPage(organizationId, pageId, options = {}) {
    await StorefrontPageSnapshot.deleteOne({ organizationId, pageId });
    if (options.invalidate !== false) {
      await StorefrontCache.invalidateStore(organizationId);
    }
  }

  async resolvePublishedPage(organizationId, slug) {
    const query = { organizationId };
    if (!slug || slug === 'home') {
      query.isHomepage = true;
    } else {
      query.slug = slug.toLowerCase();
    }

    return StorefrontPageSnapshot.findOne(query).lean();
  }
}

module.exports = new PageSnapshotService();
