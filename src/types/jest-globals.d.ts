declare global {
  function mockAppwriteResult(result: { data?: any; error?: any; count?: any }): void;
  function createMockBuilder(result: any): any;
  var mockPool: any;
  var mockAppwriteClient: any;
  var mockAppwriteAccount: any;
  var mockAppwriteUsers: any;
  var mockAppwriteStorage: any;
}

export {};