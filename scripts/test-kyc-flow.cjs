/**
 * KYC Integration Test Script
 * Simulates a complete user KYC flow: register -> submit KYC -> liveness -> face match
 * 
 * Usage: node scripts/test-kyc-flow.cjs
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

async function request(method, endpoint, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json();
  
  return { status: res.status, data };
}

function log(step, message, data = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${step}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

async function runKycFlow() {
  console.log('\n🚀 Starting KYC Integration Test Flow\n');
  
  const testEmail = `kyc-test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  let accessToken = null;

  // Step 1: Check supported countries
  log('STEP 1', 'Getting supported countries...');
  const countriesRes = await request('GET', '/kyc/countries');
  console.log(`Found ${countriesRes.data.length} supported countries`);
  console.log('Sample countries:', countriesRes.data.slice(0, 3).map(c => `${c.name} (${c.code})`).join(', '));

  // Step 2: Get PH requirements (Philippines)
  log('STEP 2', 'Getting Philippines KYC requirements...');
  const phRes = await request('GET', '/kyc/countries/PH');
  console.log('Philippines requirements:', phRes.data);

  // Step 3: Register new user
  log('STEP 3', `Registering new user: ${testEmail}`);
  const registerRes = await request('POST', '/auth/register', {
    email: testEmail,
    password: testPassword,
    role: 'freelancer',
  });
  
  if (registerRes.status !== 201) {
    console.log('❌ Registration failed:', registerRes.data);
    return;
  }
  
  accessToken = registerRes.data.accessToken;
  console.log('✅ User registered successfully');
  console.log('User ID:', registerRes.data.user.id);

  // Step 4: Check initial KYC status (should be 404)
  log('STEP 4', 'Checking initial KYC status...');
  const initialStatus = await request('GET', '/kyc/status', null, accessToken);
  console.log('Status:', initialStatus.status, initialStatus.status === 404 ? '(No KYC yet - expected)' : '');

  // Step 5: Submit KYC
  log('STEP 5', 'Submitting KYC verification...');
  const kycSubmission = {
    firstName: 'Juan',
    middleName: 'Dela',
    lastName: 'Cruz',
    dateOfBirth: '1990-05-15',
    placeOfBirth: 'Manila',
    nationality: 'Filipino',
    taxResidenceCountry: 'PH',
    address: {
      addressLine1: '123 Rizal Street',
      addressLine2: 'Barangay San Antonio',
      city: 'Makati City',
      stateProvince: 'Metro Manila',
      postalCode: '1200',
      country: 'Philippines',
      countryCode: 'PH',
    },
    document: {
      type: 'passport',
      documentNumber: 'P1234567A',
      issuingCountry: 'PH',
      issuingAuthority: 'DFA',
      issueDate: '2020-01-15',
      expiryDate: '2030-01-14',
      frontImageUrl: 'https://storage.example.com/docs/passport-front.jpg',
      backImageUrl: 'https://storage.example.com/docs/passport-back.jpg',
    },
    selfieImageUrl: 'https://storage.example.com/selfies/user-selfie.jpg',
    tier: 'standard',
  };

  const submitRes = await request('POST', '/kyc/submit', kycSubmission, accessToken);
  
  if (submitRes.status !== 201) {
    console.log('❌ KYC submission failed:', submitRes.data);
    return;
  }
  
  console.log('✅ KYC submitted successfully');
  console.log('KYC ID:', submitRes.data.id);
  console.log('Status:', submitRes.data.status);
  console.log('Tier:', submitRes.data.tier);

  // Step 6: Check KYC status after submission
  log('STEP 6', 'Checking KYC status after submission...');
  const afterSubmitStatus = await request('GET', '/kyc/status', null, accessToken);
  console.log('Status:', afterSubmitStatus.data.status);
  console.log('Documents:', afterSubmitStatus.data.documents.length);

  // Step 7: Create liveness session
  log('STEP 7', 'Creating face liveness session...');
  const livenessSessionRes = await request('POST', '/kyc/liveness/session', {
    challenges: ['blink', 'smile', 'turn_left', 'turn_right'],
  }, accessToken);

  if (livenessSessionRes.status !== 201) {
    console.log('❌ Liveness session creation failed:', livenessSessionRes.data);
    return;
  }

  console.log('✅ Liveness session created');
  console.log('Session ID:', livenessSessionRes.data.sessionId);
  console.log('Challenges:', livenessSessionRes.data.challenges.map(c => c.type).join(', '));
  console.log('Expires at:', livenessSessionRes.data.expiresAt);

  const sessionId = livenessSessionRes.data.sessionId;

  // Step 8: Get current liveness session
  log('STEP 8', 'Getting current liveness session...');
  const getSessionRes = await request('GET', '/kyc/liveness/session', null, accessToken);
  console.log('Session status:', getSessionRes.data.status);

  // Step 9: Submit liveness verification (simulating user completing challenges)
  log('STEP 9', 'Submitting liveness verification results...');
  const livenessVerifyRes = await request('POST', '/kyc/liveness/verify', {
    sessionId: sessionId,
    capturedFrames: [
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...frame1',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...frame2',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...frame3',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg...frame4',
    ],
    challengeResults: [
      { type: 'blink', completed: true, timestamp: new Date().toISOString() },
      { type: 'smile', completed: true, timestamp: new Date().toISOString() },
      { type: 'turn_left', completed: true, timestamp: new Date().toISOString() },
      { type: 'turn_right', completed: true, timestamp: new Date().toISOString() },
    ],
  }, accessToken);

  if (livenessVerifyRes.status !== 200) {
    console.log('❌ Liveness verification failed:', livenessVerifyRes.data);
    return;
  }

  console.log('✅ Liveness verification completed');
  console.log('Status:', livenessVerifyRes.data.status);
  console.log('Confidence Score:', (livenessVerifyRes.data.confidenceScore * 100).toFixed(1) + '%');
  console.log('Challenges completed:', livenessVerifyRes.data.challenges.filter(c => c.completed).length);

  // Step 10: Face match verification
  log('STEP 10', 'Verifying face match between selfie and document...');
  const faceMatchRes = await request('POST', '/kyc/face-match', {
    selfieImageUrl: 'https://storage.example.com/selfies/user-selfie.jpg',
    documentImageUrl: 'https://storage.example.com/docs/passport-front.jpg',
  }, accessToken);

  if (faceMatchRes.status !== 200) {
    console.log('❌ Face match failed:', faceMatchRes.data);
    return;
  }

  console.log('✅ Face match completed');
  console.log('Matched:', faceMatchRes.data.matched ? 'YES ✓' : 'NO ✗');
  console.log('Match Score:', (faceMatchRes.data.score * 100).toFixed(1) + '%');

  // Step 11: Add additional document (proof of address)
  log('STEP 11', 'Adding additional document (utility bill)...');
  const addDocRes = await request('POST', '/kyc/documents', {
    type: 'utility_bill',
    documentNumber: 'MERALCO-2024-001',
    issuingCountry: 'PH',
    issuingAuthority: 'Meralco',
    frontImageUrl: 'https://storage.example.com/docs/utility-bill.jpg',
  }, accessToken);

  if (addDocRes.status !== 200) {
    console.log('❌ Add document failed:', addDocRes.data);
    return;
  }

  console.log('✅ Additional document added');
  console.log('Total documents:', addDocRes.data.documents.length);

  // Step 12: Final KYC status check
  log('STEP 12', 'Final KYC status check...');
  const finalStatus = await request('GET', '/kyc/status', null, accessToken);
  
  console.log('\n📋 FINAL KYC STATUS:');
  console.log('─'.repeat(40));
  console.log('Status:', finalStatus.data.status);
  console.log('Tier:', finalStatus.data.tier);
  console.log('Name:', `${finalStatus.data.firstName} ${finalStatus.data.middleName || ''} ${finalStatus.data.lastName}`);
  console.log('Nationality:', finalStatus.data.nationality);
  console.log('Address:', `${finalStatus.data.address.city}, ${finalStatus.data.address.country}`);
  console.log('Documents:', finalStatus.data.documents.length);
  console.log('Liveness Status:', finalStatus.data.livenessCheck?.status || 'N/A');
  console.log('Face Match:', finalStatus.data.faceMatchStatus || 'N/A');
  console.log('AML Screening:', finalStatus.data.amlScreeningStatus || 'N/A');

  console.log('\n' + '='.repeat(60));
  console.log('🎉 KYC FLOW TEST COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log('\nNext steps (admin actions):');
  console.log('- Admin can review at: GET /api/kyc/admin/pending');
  console.log('- Admin can approve/reject at: POST /api/kyc/admin/review/:kycId');
  console.log('\nTest user credentials:');
  console.log(`Email: ${testEmail}`);
  console.log(`Password: ${testPassword}`);
}

// Run the test
runKycFlow().catch(err => {
  console.error('❌ Test failed with error:', err.message);
  process.exit(1);
});
