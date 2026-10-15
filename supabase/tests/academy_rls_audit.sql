-- Ejecutar completo. Los dos usuarios y todo su progreso se revierten al final.
begin;
select set_config('bullvest.academy_free', gen_random_uuid()::text, true);
select set_config('bullvest.academy_pro', gen_random_uuid()::text, true);
insert into auth.users(id, email)
select current_setting(key)::uuid, current_setting(key) || '@academy-audit.invalid'
from unnest(array['bullvest.academy_free', 'bullvest.academy_pro']) as key;
update public.profiles set role = 'pro' where id = current_setting('bullvest.academy_pro')::uuid;
select set_config('bullvest.lesson_free', l.id::text, true),
       set_config('bullvest.answers_free', k.correct_answers::text, true)
from public.academy_lessons l join public.academy_levels lv on lv.id = l.level_id
join academy_private.quiz_answers k on k.lesson_id = l.id
where lv.level_number = 1 and l.order_index = 1;
select set_config('bullvest.lesson_pro', l.id::text, true),
       set_config('bullvest.answers_pro', k.correct_answers::text, true)
from public.academy_lessons l join public.academy_levels lv on lv.id = l.level_id
join academy_private.quiz_answers k on k.lesson_id = l.id
where lv.level_number = 5 and l.order_index = 1;

do $$
begin
  if (select count(*) from public.academy_levels) <> 5
     or (select count(*) from public.academy_lessons) <> 15
     or (select count(*) from public.quizzes) <> 15
     or (select sum(jsonb_array_length(questions)) from public.quizzes) <> 45 then
    raise exception 'Incomplete curriculum';
  end if;
  if exists(select 1 from public.quizzes q join academy_private.quiz_answers k using(lesson_id)
            where jsonb_array_length(q.questions) <> cardinality(k.correct_answers)) then
    raise exception 'Question/key mismatch';
  end if;
  if has_table_privilege('authenticated', 'public.user_academy_progress', 'INSERT')
     or has_table_privilege('authenticated', 'public.user_academy_progress', 'UPDATE')
     or has_schema_privilege('authenticated', 'academy_private', 'USAGE')
     or has_function_privilege('authenticated', 'public.record_lesson_result(uuid,uuid,integer,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.submit_academy_quiz(uuid,integer[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.complete_academy_lesson(uuid)', 'EXECUTE') then
    raise exception 'Unsafe direct write or answer access grants';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('bullvest.academy_free'), true);
set local role authenticated;
do $$
declare
  free_lesson uuid := current_setting('bullvest.lesson_free')::uuid;
  pro_lesson uuid := current_setting('bullvest.lesson_pro')::uuid;
  answers integer[] := current_setting('bullvest.answers_free')::integer[];
  result record;
  original_completed_at timestamptz;
  blocked boolean;
begin
  if (select count(*) from public.academy_levels) <> 1
     or (select count(*) from public.academy_lessons) <> 3
     or (select count(*) from public.lessons) <> 3
     or (select count(*) from public.quizzes) <> 3 then
    raise exception 'Free RLS must expose only level 1';
  end if;
  if exists(select 1 from public.lessons where id = pro_lesson)
     or exists(select 1 from public.quizzes where lesson_id = pro_lesson) then
    raise exception 'Pro lesson accessible by ID to Free account';
  end if;
  blocked := false;
  begin
    perform public.submit_academy_quiz(pro_lesson, array[0,0,0]);
  exception when raise_exception then
    if sqlerrm <> 'ACADEMY_REQUIRES_PRO' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Free submitted Pro quiz'; end if;
  blocked := false;
  begin
    perform public.complete_academy_lesson(pro_lesson);
  exception when raise_exception then
    if sqlerrm <> 'ACADEMY_REQUIRES_PRO' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Free completed Pro lesson'; end if;
  blocked := false;
  begin
    perform public.complete_academy_lesson(free_lesson);
  exception when raise_exception then
    if sqlerrm <> 'QUIZ_PASS_REQUIRED' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Completed without a server-graded pass'; end if;
  blocked := false;
  begin
    perform public.submit_academy_quiz(free_lesson, array[0,0]);
  exception when raise_exception then
    if sqlerrm <> 'INVALID_QUIZ_ANSWERS' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Incomplete answers accepted'; end if;
  blocked := false;
  begin
    perform public.submit_academy_quiz(free_lesson, array[0,null,99]);
  exception when raise_exception then
    if sqlerrm <> 'INVALID_QUIZ_ANSWERS' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Invalid choices accepted'; end if;
  select * into result from public.submit_academy_quiz(free_lesson,
      array[(answers[1]+1)%3, (answers[2]+1)%3, (answers[3]+1)%3]);
  if result.score <> 0 or result.passed then raise exception 'Incorrect failing grade'; end if;
  blocked := false;
  begin
    perform public.complete_academy_lesson(free_lesson);
  exception when raise_exception then
    if sqlerrm <> 'QUIZ_PASS_REQUIRED' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Failed quiz completed a lesson'; end if;
  select * into result from public.submit_academy_quiz(free_lesson, answers);
  if result.score <> 100 or not result.passed or result.correct_count <> 3 then
    raise exception 'Incorrect passing grade';
  end if;
  select completed_at into original_completed_at from public.complete_academy_lesson(free_lesson);
  perform public.complete_academy_lesson(free_lesson);
  perform public.submit_academy_quiz(free_lesson,
      array[(answers[1]+1)%3, (answers[2]+1)%3, (answers[3]+1)%3]);
  if (select count(*) from public.user_academy_progress) <> 1
     or not exists(select 1 from public.user_academy_progress where user_id = auth.uid()
                   and completed and score = 100 and completed_at = original_completed_at) then
    raise exception 'Completion or best score lost on retry';
  end if;
  blocked := false;
  begin
    perform * from academy_private.quiz_answers;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Answer keys exposed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('bullvest.academy_pro'), true);
do $$
begin
  if (select count(*) from public.academy_levels) <> 5
     or (select count(*) from public.lessons) <> 15
     or (select count(*) from public.quizzes) <> 15 then
    raise exception 'Pro curriculum missing';
  end if;
  if exists(select 1 from public.user_academy_progress) then
    raise exception 'Cross-user progress exposed';
  end if;
  perform public.submit_academy_quiz(current_setting('bullvest.lesson_pro')::uuid,
                                   current_setting('bullvest.answers_pro')::integer[]);
  perform public.complete_academy_lesson(current_setting('bullvest.lesson_pro')::uuid);
  if not exists(select 1 from public.user_academy_progress where completed and score = 100 and user_id = auth.uid()) then
    raise exception 'Pro progress not saved';
  end if;
end;
$$;
reset role;
-- La bajada a Free conserva progreso, pero vuelve a bloquear contenido y RPC Pro.
update public.profiles set role = 'free' where id = current_setting('bullvest.academy_pro')::uuid;
set local role authenticated;
do $$
declare blocked boolean := false;
begin
  if (select count(*) from public.lessons) <> 3
     or not exists(select 1 from public.user_academy_progress where completed) then
    raise exception 'Downgrade must preserve progress and revoke paid content';
  end if;
  begin
    perform public.complete_academy_lesson(current_setting('bullvest.lesson_pro')::uuid);
  exception when raise_exception then
    if sqlerrm <> 'ACADEMY_REQUIRES_PRO' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Downgraded user can complete Pro lesson'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: 5 levels, 15 lessons/quizzes, 45 questions; Free/Pro RLS, private keys, server grading, completion, retries, downgrade and user isolation; fixtures rolled back' as audit_result;
