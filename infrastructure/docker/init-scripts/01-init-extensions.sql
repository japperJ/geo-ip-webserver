-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Verify extensions
SELECT 
    extname AS "Extension",
    extversion AS "Version"
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'postgis')
ORDER BY extname;

-- Set timezone
ALTER DATABASE geo_ip_webserver SET timezone TO 'UTC';
