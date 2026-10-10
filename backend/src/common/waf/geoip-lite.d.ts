declare module 'geoip-lite' {
  interface Lookup {
    country: string;
    region: string;
    city: string;
    ll: [number, number];
    range: [number, number];
    metro: number;
    timezone: string;
  }

  function lookup(ip: string): Lookup | null;

  export = {
    lookup,
  };
}