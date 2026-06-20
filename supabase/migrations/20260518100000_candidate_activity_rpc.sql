create or replace function public.get_candidate_activity(p_mission_id uuid)
returns table (
  profile_id    uuid,
  profile_name  text,
  type_name     text,
  mission_id    uuid,
  mission_title text,
  mission_date  timestamptz,
  hours         numeric
)
language sql
security invoker
stable
as $$
  with candidates as (
    select distinct mp.volunteer_id as profile_id
    from mission_proposals mp
    where mp.mission_id = p_mission_id
      and mp.response = 'available'
  )
  select
    p.id                                                                    as profile_id,
    coalesce(p.full_name, p.email)                                          as profile_name,
    mt.name                                                                 as type_name,
    m.id                                                                    as mission_id,
    m.title                                                                 as mission_title,
    m.starts_at                                                             as mission_date,
    round(
      extract(epoch from (
        coalesce(m.ends_at, m.starts_at + interval '2 hours') - m.starts_at
      )) / 3600.0,
      1
    )                                                                       as hours
  from mission_assignments ma
  join candidates c      on c.profile_id = ma.volunteer_id
  join missions m        on m.id = ma.mission_id
  join mission_types mt  on mt.id = m.mission_type_id
  join profiles p        on p.id = ma.volunteer_id
  where m.starts_at >= now() - interval '12 months'
    and m.id <> p_mission_id
    and m.status in ('confirmed', 'closed')
$$;
