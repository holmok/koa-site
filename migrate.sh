#!/usr/bin/env bash
migrate \
  -source file://${PWD}/migrations \
  -database "postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}?search_path=${PG_SCHEMA},public&sslmode=disable" \
  $1 $2;
