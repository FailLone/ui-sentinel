"""Actual Browser Use Agent.run with shared quality tools over a private local RPC."""
import asyncio
import json
import os
from pathlib import Path
from typing import Literal

import httpx
from browser_use import Agent, BrowserSession, Tools, ActionResult
from browser_use.llm.openrouter.chat import ChatOpenRouter
from pydantic import BaseModel


class Final(BaseModel):
    reason: Literal["scope-covered", "observed-blocker", "unverified-scope"]


async def main():
    catalog = json.loads(Path(os.environ["NATIVE_CATALOG"]).read_text())
    headers = {"Authorization": "Bearer " + os.environ["NATIVE_TOKEN"]}
    client = httpx.AsyncClient(base_url=os.environ["NATIVE_RPC"], headers=headers, timeout=17)

    async def rpc(path, body):
        response = await client.post(path, json=body)
        result = response.json()
        if response.is_error:
            raise RuntimeError(result.get("error", "RPC error"))
        return result

    async def call(name, args):
        try:
            return ActionResult(extracted_content=json.dumps(await rpc("/tool", {"name": name, "args": args})))
        except Exception as error:
            return ActionResult(error=str(error))

    descriptions = {t["name"]: t["description"] for t in catalog["tools"]}
    tools = Tools(exclude_actions=["search", "evaluate", "read_file", "write_file", "replace_file", "upload_file", "screenshot"], output_model=Final)

    @tools.action(descriptions["quality_inspect"])
    async def quality_inspect():
        return await call("quality_inspect", {})

    @tools.action(descriptions["quality_hypothesis"])
    async def quality_hypothesis(phenomenon: str, basis: str, verificationPlan: str, eventType: str, target: str, condition: Literal["element-actionable", "element-visible"], timeoutMs: int):
        return await call("quality_hypothesis", {"phenomenon": phenomenon, "basis": basis, "verificationPlan": verificationPlan, "eventType": eventType, "target": target, "condition": condition, "timeoutMs": timeoutMs})

    @tools.action(descriptions["quality_measure"])
    async def quality_measure(hypothesisId: str, qualityRef: str):
        return await call("quality_measure", {"hypothesisId": hypothesisId, "qualityRef": qualityRef})

    @tools.action(descriptions["quality_resolve"])
    async def quality_resolve(hypothesisId: str, status: Literal["supported", "refuted", "inconclusive"], title: str, expected: str, actual: str, severity: Literal["error", "warning", "info"]):
        return await call("quality_resolve", {"hypothesisId": hypothesisId, "status": status, "title": title, "expected": expected, "actual": actual, "severity": severity})

    @tools.action(descriptions["quality_vision_locate"])
    async def quality_vision_locate(description: str):
        return await call("quality_vision_locate", {"description": description})

    session = BrowserSession(cdp_url=os.environ["NATIVE_CDP"], allowed_domains=[os.environ["ARENA_URL"]], keep_alive=True, enable_default_extensions=False)
    record = {"completed": False}
    try:
        llm = ChatOpenRouter(model="deepseek/deepseek-v4.1-flash", api_key=os.environ["OPENAI_API_KEY"], base_url=os.environ["OPENAI_BASE_URL"], timeout=60, max_retries=0)
        agent = Agent(task=catalog["goal"], llm=llm, browser_session=session, tools=tools,
                      extend_system_message=catalog["instructions"], use_vision=False, page_extraction_llm=llm,
                      flash_mode=os.environ.get("NATIVE_FLASH_MODE") == "1",
                      judge_llm=llm, use_judge=False, fallback_llm=None, max_failures=1, max_actions_per_step=1,
                      llm_timeout=60, step_timeout=80, directly_open_url=False, final_response_after_failure=False,
                      enable_signal_handler=False, file_system_path=os.environ["NATIVE_FILES"])
        async def after_step(_):
            await rpc("/step", {})
        history = await asyncio.wait_for(agent.run(max_steps=40, on_step_end=after_step), timeout=300)
        result = history.final_result()
        record.update(completed=history.is_done(), success=history.is_successful(), result=result, errors=history.errors(), steps=len(history.history))
        if result:
            try:
                record["output"] = json.loads(result)
            except ValueError:
                pass
        if record["completed"]:
            record["acceptedFinish"] = await rpc("/finish", record.get("output"))
    except Exception as error:
        record["error"] = str(error)
    finally:
        Path(os.environ["NATIVE_DRIVER_OUTPUT"]).write_text(json.dumps(record, indent=2) + "\n")
        await client.aclose()
        await session.stop()


asyncio.run(main())
