import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title='Student Reports API', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','), allow_methods=['GET'], allow_headers=['*'])
MAIN_URL = os.getenv('MAIN_SERVICE_URL', 'http://localhost:8000')

class GroupReport(BaseModel):
    group_id: int
    group_name: str
    student_count: int

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/reports/students-by-group', response_model=list[GroupReport])
async def students_by_group():
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f'{MAIN_URL}/statistics/group-counts')
            response.raise_for_status()
            return response.json()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise HTTPException(502, 'Не удалось получить данные основного сервиса') from exc
