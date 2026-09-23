"""Native Browser Use loop on a disposable public page; not a quality benchmark."""
import asyncio
import json
import os
from pathlib import Path

from browser_use import Agent, BrowserSession, Tools
from browser_use.llm.openrouter.chat import ChatOpenRouter
from pydantic import BaseModel


class Answer(BaseModel):
    observed_heading: str


async def main():
    record = {"completed": False, "kind": "native-loop-preflight"}
    session = BrowserSession(
        cdp_url=os.environ["EXPERIMENT_CDP"],
        allowed_domains=[os.environ["EXPERIMENT_ORIGIN"]],
        keep_alive=True,
        enable_default_extensions=False,
    )
    try:
        llm = ChatOpenRouter(
            model="deepseek/deepseek-v4.1-flash",
            api_key=os.environ["OPENAI_API_KEY"],
            base_url=os.environ["OPENAI_BASE_URL"],
            timeout=60,
            max_retries=0,
        )
        tools = Tools(
            exclude_actions=["search", "evaluate", "read_file", "write_file", "replace_file", "upload_file", "screenshot"],
            output_model=Answer,
        )
        agent = Agent(
            task="Read the heading on the already open page, return it as observed_heading and finish. No navigation or modification is needed.",
            llm=llm,
            browser_session=session,
            tools=tools,
            use_vision=False,
            page_extraction_llm=llm,
            judge_llm=llm,
            use_judge=False,
            fallback_llm=None,
            max_failures=1,
            max_actions_per_step=1,
            llm_timeout=60,
            step_timeout=75,
            directly_open_url=False,
            final_response_after_failure=False,
            enable_signal_handler=False,
            file_system_path=os.environ["EXPERIMENT_FILES"],
        )
        history = await asyncio.wait_for(agent.run(max_steps=3), timeout=90)
        record.update(
            completed=history.is_done(),
            success=history.is_successful(),
            result=history.final_result(),
            errors=history.errors(),
            steps=len(history.history),
        )
    except Exception as error:
        record["error"] = str(error)
    finally:
        Path(os.environ["EXPERIMENT_OUTPUT"]).write_text(json.dumps(record, indent=2) + "\n")
        await session.stop()


asyncio.run(main())
