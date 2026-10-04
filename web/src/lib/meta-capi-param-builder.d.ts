/** Meta's client-side Parameter Builder (meta-capi-param-builder-clientjs) - the part used here. */
declare module 'meta-capi-param-builder-clientjs' {
  interface CollectedParams {
    _fbc?: string;
    _fbp?: string;
    /** The visitor's IP as the browser found it (getIpFn), IPv6 when it has one. */
    _fbi?: string;
  }
  const clientParamBuilder: {
    processAndCollectAllParams(url?: string | null, getIpFn?: () => string | Promise<string>): Promise<CollectedParams>;
    getFbc(): string;
    getFbp(): string;
    getClientIpAddress(): string;
  };
  export default clientParamBuilder;
}
