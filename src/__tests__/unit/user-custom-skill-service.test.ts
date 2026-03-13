import { describe, it, expect } from '@jest/globals';

describe('User Custom Skill Service', () => {
  it('should be able to import the service module', async () => {
    // Simple test to verify the module can be imported without errors
    const service = await import('../../services/user-custom-skill-service');
    expect(service).toBeDefined();
    expect(typeof service.createUserCustomSkill).toBe('function');
    expect(typeof service.getUserCustomSkills).toBe('function');
    expect(typeof service.getUserCustomSkillById).toBe('function');
    expect(typeof service.updateUserCustomSkill).toBe('function');
    expect(typeof service.deleteUserCustomSkill).toBe('function');
    expect(typeof service.searchUserCustomSkills).toBe('function');
  });

  it('should export all required functions', async () => {
    const service = await import('../../services/user-custom-skill-service');
    const expectedFunctions = [
      'createUserCustomSkill',
      'getUserCustomSkills', 
      'getUserCustomSkillById',
      'updateUserCustomSkill',
      'deleteUserCustomSkill',
      'searchUserCustomSkills'
    ];
    
    expectedFunctions.forEach(funcName => {
      expect((service as any)[funcName]).toBeDefined();
      expect(typeof (service as any)[funcName]).toBe('function');
    });
  });
});