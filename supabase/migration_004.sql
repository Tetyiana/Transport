-- Migration 004: точки маршруту з координатами
alter table trips add column if not exists route_from_coords text;
alter table trips add column if not exists route_to_coords text;
alter table trips add column if not exists customs_out_point text;
alter table trips add column if not exists customs_out_coords text;
alter table trips add column if not exists border_point text;
alter table trips add column if not exists border_coords text;
alter table trips add column if not exists customs_in_point text;
alter table trips add column if not exists customs_in_coords text;
