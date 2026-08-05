import NodeGeocoder, { Options, Entry } from 'node-geocoder';
import logger from '../logger';

export interface GeocodeLocation {
  address: string;
}

export interface GeocodeCoordinates {
  lat: number;
  lon: number;
}

class GeocoderServiceProvider {
  private geocoder: NodeGeocoder.Geocoder;

  constructor() {
    const options: Options = {
      provider: (process.env.GEOCODER_PROVIDER as 'openstreetmap' | 'google') || 'openstreetmap',
      apiKey: process.env.GEOCODER_API_KEY, 
      formatter: null
    };

    this.geocoder = NodeGeocoder(options);
  }

  public async getCoordinates(address: string): Promise<Entry[] | null> {
    try {
      const results = await this.geocoder.geocode(address);
      return results;
    } catch (error) {
      const err = error as Error;
      logger.error(`[GeocoderService] Failed to resolve coordinates for address: ${address} - ${err.message}`);
      return null;
    }
  }

  public async getAddress(lat: number, lon: number): Promise<Entry[] | null> {
    try {
      const results = await this.geocoder.reverse({ lat, lon });
      return results;
    } catch (error) {
      const err = error as Error;
      logger.error(`[GeocoderService] Failed to reverse geocode coordinates: [${lat}, ${lon}] - ${err.message}`);
      return null;
    }
  }
}

export const GeocoderService = new GeocoderServiceProvider();