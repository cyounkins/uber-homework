CREATE TABLE trips (
  id SERIAL PRIMARY KEY, 
  start_time timestamp, 
  start_point geometry(POINT,4326), 
  end_time timestamp, 
  end_point geometry(POINT,4326), 
  duration_sec int4, 
  path_polyline text
);