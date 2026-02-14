import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { GeoIPService } from '../services/geoip.js';

declare module 'fastify' {
  interface FastifyInstance {
    geoip: GeoIPService;
  }
}

const geoipPlugin: FastifyPluginAsync = async (fastify) => {
  const geoip = new GeoIPService(fastify.log);
  
  const cityDbPath = process.env.GEOIP_CITY_DB_PATH || './data/GeoLite2-City.mmdb';
  const countryDbPath = process.env.GEOIP_COUNTRY_DB_PATH || './data/GeoLite2-Country.mmdb';
  const anonDbPath = process.env.GEOIP_ANON_DB_PATH;
  
  await geoip.initialize(cityDbPath, countryDbPath, anonDbPath);
  
  fastify.decorate('geoip', geoip);
};

export default fp(geoipPlugin, {
  name: 'geoip'
});
