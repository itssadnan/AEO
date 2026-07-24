-- Module 5.2 follow-up: create_brand_with_details() RPC
--
-- Wraps brand + competitors + prompts creation in one call so a single form
-- submission is atomic (a plpgsql function's effects roll back together if
-- any statement inside raises — e.g. the prompt-count trigger from 0005
-- rejecting an over-limit or non-AI-suggested prompt aborts the whole brand
-- creation, not just the failing prompt row).
--
-- Deliberately SECURITY INVOKER (the default — no explicit clause needed),
-- unlike create_workspace() in migration 0001. create_workspace() had to be
-- SECURITY DEFINER because workspaces/workspace_members have no
-- client-facing INSERT policy at all. Here, brands/competitors/prompts
-- already have real owner/member INSERT policies from 0005, so this
-- function can run as the calling user and let every insert inside it go
-- through the normal RLS check — a Viewer (or a non-member) calling this
-- gets rejected by the same policies a direct insert would hit, with no
-- separate permission logic to keep in sync.
create or replace function public.create_brand_with_details(
  p_workspace_id uuid,
  p_name text,
  p_website text,
  p_competitor_names text[],
  p_prompt_texts text[],
  p_prompts_ai_suggested boolean default true
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_brand_id uuid;
  v_competitor_name text;
  v_prompt_text text;
begin
  insert into public.brands (workspace_id, name, website)
  values (p_workspace_id, p_name, nullif(p_website, ''))
  returning id into v_brand_id;

  if p_competitor_names is not null then
    foreach v_competitor_name in array p_competitor_names loop
      if length(trim(v_competitor_name)) > 0 then
        insert into public.competitors (brand_id, name) values (v_brand_id, trim(v_competitor_name));
      end if;
    end loop;
  end if;

  if p_prompt_texts is not null then
    foreach v_prompt_text in array p_prompt_texts loop
      if length(trim(v_prompt_text)) > 0 then
        insert into public.prompts (brand_id, text, is_ai_suggested)
        values (v_brand_id, trim(v_prompt_text), p_prompts_ai_suggested);
      end if;
    end loop;
  end if;

  return v_brand_id;
end;
$$;

revoke all on function public.create_brand_with_details(uuid, text, text, text[], text[], boolean) from public, anon;
grant execute on function public.create_brand_with_details(uuid, text, text, text[], text[], boolean) to authenticated;
