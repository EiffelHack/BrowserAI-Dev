"""Is This True? — Paste any claim, get a confidence score + evidence.

Usage:
    pip install -r requirements.txt
    BROWSEAI_API_KEY=bai_xxx python app.py

Then open http://localhost:8000
"""

import os
import uuid

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from browseaidev import BrowseAIDev

app = FastAPI(title="Is This True?")
templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))

# In-memory result store (swap for Redis/DB in production)
results_store: dict[str, dict] = {}

API_KEY = os.environ.get("BROWSEAI_API_KEY", "bai_xxx")


def get_client() -> BrowseAIDev:
    return BrowseAIDev(api_key=API_KEY)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "result": None, "query": ""})


@app.post("/check", response_class=HTMLResponse)
async def check(request: Request, query: str = Form(...), depth: str = Form("fast")):
    client = get_client()
    try:
        result = client.ask(query, depth=depth)
    except Exception as e:
        return templates.TemplateResponse("index.html", {
            "request": request,
            "result": None,
            "query": query,
            "error": str(e),
        })
    finally:
        client.close()

    result_dict = result.model_dump(by_alias=True)

    # Generate a shareable ID
    result_id = result.share_id or uuid.uuid4().hex[:12]
    results_store[result_id] = {"query": query, "depth": depth, **result_dict}

    return RedirectResponse(url=f"/r/{result_id}", status_code=303)


@app.get("/r/{result_id}", response_class=HTMLResponse)
async def view_result(request: Request, result_id: str):
    data = results_store.get(result_id)
    if not data:
        return templates.TemplateResponse("index.html", {
            "request": request,
            "result": None,
            "query": "",
            "error": "Result not found. It may have expired.",
        })

    return templates.TemplateResponse("index.html", {
        "request": request,
        "result": data,
        "query": data["query"],
        "result_id": result_id,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
