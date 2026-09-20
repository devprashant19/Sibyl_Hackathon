export const trace = {
  getTracer: () => ({
    startActiveSpan: (name: string, options: any, cb: any) => cb({
      setStatus: () => {},
      recordException: () => {},
      end: () => {}
    })
  })
};

export const metrics = {
  getMeter: () => ({
    createObservableGauge: () => ({ addCallback: () => {} }),
    createHistogram: () => ({ record: () => {} }),
    createCounter: () => ({ add: () => {} })
  })
};

export const context = {};
