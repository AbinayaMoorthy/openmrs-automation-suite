// Central test data — change values here, updates everywhere
const users = {
  admin: {
    username: 'admin',
    password: 'Admin123'
  },
  invalid: {
    username: 'invaliduser',
    password: 'wrongpassword'
  }
};

// Generate unique patient name using timestamp to avoid duplicates
const timestamp = Date.now();

const patients = {
  new: {
    firstName: 'Abinaya',
    lastName: `Test${timestamp}`,
    gender: 'Female',
    day: '15',
    month: 'March',
    year: '1995',
    address: 'Dubai Healthcare City'
  },
  search: {
    existing: 'John',          // Common name in demo data
    nonExistent: 'ZZZNOMATCH999XYZ'
  }
};

const appointments = {
  new: {
    reason: 'General Checkup',
    notes: 'Automated test appointment'
  }
};

const urls = {
  login: 'https://test3.openmrs.org/openmrs/spa/login',
  home: 'https://test3.openmrs.org/openmrs/spa/home/service-queues',
  appointments: 'https://test3.openmrs.org/openmrs/spa/home/appointments',
  patientRegistration: 'https://test3.openmrs.org/openmrs/spa/patient-registration',
  patientSearch: 'https://test3.openmrs.org/openmrs/spa/search'
};

module.exports = { users, patients, appointments, urls };
