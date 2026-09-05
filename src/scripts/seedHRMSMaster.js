'use strict';

require('dotenv').config({ path: `${__dirname}/../.env` });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.DATABASE);
    const orgId = new mongoose.Types.ObjectId('6a204dbb9f37685afca22d89');
    
    // Register models
    require('../modules/HRMS/core-hr/models/department.model');
    require('../modules/HRMS/core-hr/models/designation.model');
    require('../modules/HRMS/core-hr/models/employee.model');

    const Dept = mongoose.model('Department');
    const Desig = mongoose.model('Designation');
    const Employee = mongoose.model('Employee');

    const standardDepts = [
      { name: 'Engineering & Technology', code: 'ENG', description: 'Product development and IT infrastructure' },
      { name: 'Sales & Marketing', code: 'MKT', description: 'Business development and client relations' },
      { name: 'Human Resources', code: 'HR', description: 'People operations and talent acquisition' },
      { name: 'Operations', code: 'OPS', description: 'Logistics and day-to-day business operations' }
    ];

    for (const d of standardDepts) {
      const exists = await Dept.findOne({ organizationId: orgId, code: d.code });
      if (!exists) {
        await Dept.create({ ...d, organizationId: orgId });
        console.log('Created department:', d.name);
      }
    }

    const standardDesigs = [
      { title: 'Technical Lead', code: 'TL', level: 8, grade: 'B' },
      { title: 'Senior Software Engineer', code: 'SSE', level: 6, grade: 'B' },
      { title: 'HR Manager', code: 'HRM', level: 7, grade: 'B' },
      { title: 'Operations Executive', code: 'OPS-EX', level: 4, grade: 'A' }
    ];

    for (const d of standardDesigs) {
      const exists = await Desig.findOne({ organizationId: orgId, code: d.code });
      if (!exists) {
        await Desig.create({ ...d, organizationId: orgId });
        console.log('Created designation:', d.title);
      }
    }

    // Update EMP 2 and EMP 3 with departments and designations
    const engDept = await Dept.findOne({ organizationId: orgId, code: 'ENG' });
    const hrDept = await Dept.findOne({ organizationId: orgId, code: 'HR' });
    const tlDesig = await Desig.findOne({ organizationId: orgId, code: 'TL' });
    const hrmDesig = await Desig.findOne({ organizationId: orgId, code: 'HRM' });

    if (engDept && tlDesig) {
      await Employee.updateOne(
        { organizationId: orgId, user: new mongoose.Types.ObjectId('6a218248bcc2818128fa5907') },
        { departmentId: engDept._id, designationId: tlDesig._id }
      );
    }

    if (hrDept && hrmDesig) {
      await Employee.updateOne(
        { organizationId: orgId, user: new mongoose.Types.ObjectId('6a2140074663f78e4db55369') },
        { departmentId: hrDept._id, designationId: hrmDesig._id }
      );
    }

    console.log('✅ Department & Designation setup complete!');
  } catch (err) {
    console.error('Error seeding HRMS master:', err);
  } finally {
    await mongoose.disconnect();
  }
})();
