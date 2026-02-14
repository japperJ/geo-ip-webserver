# GeoLite2 Database Setup

This directory should contain the MaxMind GeoLite2 databases for IP geolocation.

## Required Files

- `GeoLite2-City.mmdb`
- `GeoLite2-Country.mmdb`

## Download Instructions

1. **Create a free MaxMind account**: https://www.maxmind.com/en/geolite2/signup

2. **Login to your MaxMind account**

3. **Navigate to "Download Files"** under GeoIP2 / GeoLite2

4. **Download the following databases** (MMDB format):
   - GeoLite2 City
   - GeoLite2 Country

5. **Extract and place the `.mmdb` files in this directory**:
   ```bash
   # Extract downloaded files
   gunzip GeoLite2-City.tar.gz
   tar -xf GeoLite2-City.tar
   
   gunzip GeoLite2-Country.tar.gz
   tar -xf GeoLite2-Country.tar
   
   # Copy MMDB files to this directory
   cp GeoLite2-City_*/GeoLite2-City.mmdb .
   cp GeoLite2-Country_*/GeoLite2-Country.mmdb .
   ```

6. **Verify the files are in place**:
   ```bash
   ls -lh *.mmdb
   ```

## Environment Variables

The backend uses these environment variables (already set in `.env`):

```env
GEOIP_CITY_DB_PATH=./data/GeoLite2-City.mmdb
GEOIP_COUNTRY_DB_PATH=./data/GeoLite2-Country.mmdb
```

## Note

These database files are in `.gitignore` and should NOT be committed to version control. Each developer must download them independently.

## License

GeoLite2 databases are provided by MaxMind under Creative Commons Attribution-ShareAlike 4.0 International License.
