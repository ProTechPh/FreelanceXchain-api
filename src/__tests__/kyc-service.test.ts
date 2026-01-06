import {
  getSupportedCountries,
  getCountryRequirements,
  isCountrySupported,
  isDocumentTypeSupported,
  isKycError,
  isKycApproved,
  isKycComplete,
} from '../services/kyc-service.js';
import { KycVerification } from '../models/kyc.js';

describe('KYC Service', () => {
  describe('getSupportedCountries', () => {
    it('should return list of supported countries', () => {
      const countries = getSupportedCountries();
      
      expect(Array.isArray(countries)).toBe(true);
      expect(countries.length).toBeGreaterThan(0);
      
      const us = countries.find(c => c.code === 'US');
      expect(us).toBeDefined();
      expect(us?.name).toBe('United States');
      expect(us?.supportedDocuments).toContain('passport');
      expect(us?.requiresLiveness).toBe(true);
    });

    it('should include countries from different regions', () => {
      const countries = getSupportedCountries();
      const codes = countries.map(c => c.code);
      
      expect(codes).toContain('US');
      expect(codes).toContain('GB');
      expect(codes).toContain('JP');
      expect(codes).toContain('IN');
      expect(codes).toContain('NG');
      expect(codes).toContain('BR');
    });
  });

  describe('getCountryRequirements', () => {
    it('should return requirements for supported country', () => {
      const uk = getCountryRequirements('GB');
      
      expect(uk).not.toBeNull();
      expect(uk?.code).toBe('GB');
      expect(uk?.name).toBe('United Kingdom');
      expect(uk?.supportedDocuments).toContain('passport');
      expect(uk?.supportedDocuments).toContain('drivers_license');
    });

    it('should return null for unsupported country', () => {
      const result = getCountryRequirements('XX');
      expect(result).toBeNull();
    });

    it('should have correct tier assignments', () => {
      const us = getCountryRequirements('US');
      const ng = getCountryRequirements('NG');
      const sg = getCountryRequirements('SG');
      
      expect(us?.tier).toBe('enhanced');
      expect(ng?.tier).toBe('basic');
      expect(sg?.tier).toBe('standard');
    });
  });

  describe('isCountrySupported', () => {
    it('should return true for supported countries', () => {
      expect(isCountrySupported('US')).toBe(true);
      expect(isCountrySupported('GB')).toBe(true);
      expect(isCountrySupported('IN')).toBe(true);
    });

    it('should return false for unsupported countries', () => {
      expect(isCountrySupported('XX')).toBe(false);
      expect(isCountrySupported('ZZ')).toBe(false);
      expect(isCountrySupported('')).toBe(false);
    });
  });

  describe('isDocumentTypeSupported', () => {
    it('should return true for supported document types', () => {
      expect(isDocumentTypeSupported('US', 'passport')).toBe(true);
      expect(isDocumentTypeSupported('US', 'drivers_license')).toBe(true);
      expect(isDocumentTypeSupported('IN', 'voter_id')).toBe(true);
    });

    it('should return false for unsupported document types', () => {
      expect(isDocumentTypeSupported('US', 'voter_id')).toBe(false);
      expect(isDocumentTypeSupported('GB', 'voter_id')).toBe(false);
    });

    it('should return false for unsupported country', () => {
      expect(isDocumentTypeSupported('XX', 'passport')).toBe(false);
    });
  });

  describe('isKycError', () => {
    it('should return true for error objects', () => {
      const error = { code: 'TEST_ERROR', message: 'Test error' };
      expect(isKycError(error)).toBe(true);
    });

    it('should return false for non-error objects', () => {
      expect(isKycError(null)).toBe(false);
      expect(isKycError(undefined)).toBe(false);
      expect(isKycError({ id: '123', status: 'pending' })).toBe(false);
    });
  });

  describe('isKycApproved', () => {
    it('should return true for approved KYC', () => {
      const kyc = { status: 'approved' } as KycVerification;
      expect(isKycApproved(kyc)).toBe(true);
    });

    it('should return false for non-approved KYC', () => {
      expect(isKycApproved({ status: 'pending' } as KycVerification)).toBe(false);
      expect(isKycApproved({ status: 'submitted' } as KycVerification)).toBe(false);
      expect(isKycApproved({ status: 'rejected' } as KycVerification)).toBe(false);
      expect(isKycApproved(null)).toBe(false);
    });
  });

  describe('isKycComplete', () => {
    const baseKyc: KycVerification = {
      id: 'test-id',
      userId: 'user-id',
      status: 'submitted',
      tier: 'standard',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      nationality: 'US',
      address: {
        addressLine1: '123 Main St',
        city: 'New York',
        country: 'United States',
        countryCode: 'US',
      },
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should return true when all requirements met', () => {
      const kyc: KycVerification = {
        ...baseKyc,
        documents: [{ id: '1', type: 'passport', documentNumber: '123', issuingCountry: 'US', frontImageUrl: 'url', verificationStatus: 'pending', uploadedAt: new Date().toISOString() }],
        livenessCheck: { id: '1', sessionId: 's1', status: 'passed', confidenceScore: 0.9, challenges: [], capturedFrames: [], expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        faceMatchStatus: 'matched',
      };
      
      expect(isKycComplete(kyc)).toBe(true);
    });

    it('should return false when documents missing', () => {
      const kyc: KycVerification = {
        ...baseKyc,
        documents: [],
        livenessCheck: { id: '1', sessionId: 's1', status: 'passed', confidenceScore: 0.9, challenges: [], capturedFrames: [], expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        faceMatchStatus: 'matched',
      };
      
      expect(isKycComplete(kyc)).toBe(false);
    });

    it('should return false when liveness not passed', () => {
      const kyc: KycVerification = {
        ...baseKyc,
        documents: [{ id: '1', type: 'passport', documentNumber: '123', issuingCountry: 'US', frontImageUrl: 'url', verificationStatus: 'pending', uploadedAt: new Date().toISOString() }],
        livenessCheck: { id: '1', sessionId: 's1', status: 'pending', confidenceScore: 0, challenges: [], capturedFrames: [], expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        faceMatchStatus: 'matched',
      };
      
      expect(isKycComplete(kyc)).toBe(false);
    });

    it('should return false when face not matched', () => {
      const kyc: KycVerification = {
        ...baseKyc,
        documents: [{ id: '1', type: 'passport', documentNumber: '123', issuingCountry: 'US', frontImageUrl: 'url', verificationStatus: 'pending', uploadedAt: new Date().toISOString() }],
        livenessCheck: { id: '1', sessionId: 's1', status: 'passed', confidenceScore: 0.9, challenges: [], capturedFrames: [], expiresAt: new Date().toISOString(), createdAt: new Date().toISOString() },
        faceMatchStatus: 'not_matched',
      };
      
      expect(isKycComplete(kyc)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isKycComplete(null)).toBe(false);
    });
  });
});

describe('KYC Document Types', () => {
  it('should support passport in all countries', () => {
    const countries = getSupportedCountries();
    
    countries.forEach(country => {
      expect(country.supportedDocuments).toContain('passport');
    });
  });

  it('should have at least 2 document types per country', () => {
    const countries = getSupportedCountries();
    
    countries.forEach(country => {
      expect(country.supportedDocuments.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('KYC Liveness Requirements', () => {
  it('should require liveness for all countries', () => {
    const countries = getSupportedCountries();
    
    countries.forEach(country => {
      expect(country.requiresLiveness).toBe(true);
    });
  });
});
