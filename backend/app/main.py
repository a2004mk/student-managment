import os
from contextlib import asynccontextmanager
from typing import Annotated
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import create_engine, String, Integer, ForeignKey, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, Session, sessionmaker
from sqlalchemy.exc import IntegrityError

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./students.db')
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {})
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase):
    pass

#таблцы
class Group(Base):
    __tablename__ = 'groups'
    id: Mapped[int] = mapped_column(primary_key=True)#PK
    name: Mapped[str] = mapped_column(String(100), unique=True)
    specialization: Mapped[str] = mapped_column(String(150))
    course: Mapped[int] = mapped_column(Integer)
    students: Mapped[list['Student']] = relationship(back_populates='group')#обратная сторона один ко многим

class Student(Base):
    __tablename__ = 'students'
    id: Mapped[int] = mapped_column(primary_key=True)
    last_name: Mapped[str] = mapped_column(String(100), index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    group_id: Mapped[int] = mapped_column(ForeignKey('groups.id'), index=True) #FK -> groups.id, index
    group: Mapped[Group] = relationship(back_populates='students') #у группы много студентов, у студента одна группа

#вход-выход api
    # на вход: имя, специализация, курс(1-6)
class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    specialization: str = Field(min_length=1, max_length=150)
    course: int = Field(ge=1, le=6)

    #ответ: то же и id+1
class GroupOut(GroupIn):
    id: int
    model_config = ConfigDict(from_attributes=True)
    
    #вход фио + майл + group_id > 0
class StudentIn(BaseModel):
    last_name: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    group_id: int = Field(gt=0)
    
    #ответ: +id
class StudentOut(StudentIn):
    id: int
    model_config = ConfigDict(from_attributes=True)

    #статистика id группы, название группы, кол-во студентов
class GroupCount(BaseModel):
    group_id: int
    group_name: str
    student_count: int

#сессия бд и lifespan
def get_db():
    with SessionLocal() as db:
        yield db

DB = Annotated[Session, Depends(get_db)]

#таблицы появляются при запуске бэкенда, разрешен origin фронта
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title='Student Management API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','), allow_credentials=False, allow_methods=['*'], allow_headers=['*'])

#найти или ошибка 404. используются в get update delete и при привязке студнта
def required_group(db, group_id):
    obj = db.get(Group, group_id)
    if obj is None:
        raise HTTPException(404, 'Учебная группа не найдена')
    return obj

def required_student(db, student_id):
    obj = db.get(Student, student_id)
    if obj is None:
        raise HTTPException(404, 'Студент не найден')
    return obj

#ловит повторы имени или почты
def commit_or_conflict(db, message):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, message)
    
#проверка что процесс жив
@app.get('/health')
def health():
    return {'status': 'ok'}

#список сортировка по name
@app.get('/groups', response_model=list[GroupOut])
def list_groups(db: DB):
    return db.scalars(select(Group).order_by(Group.name)).all()

#создать - 201, дубликат имени - 409
@app.post('/groups', response_model=GroupOut, status_code=201)
def create_group(data: GroupIn, db: DB):
    obj = Group(**data.model_dump())
    db.add(obj)
    commit_or_conflict(db, 'Группа с таким названием уже существует')
    db.refresh(obj)
    return obj

#одна группа или 404
@app.get('/groups/{group_id}', response_model=GroupOut)
def get_group(group_id: int, db: DB):
    return required_group(db, group_id)

#ообновить поля, дубликат имени - 409
@app.put('/groups/{group_id}', response_model=GroupOut)
def update_group(group_id: int, data: GroupIn, db: DB):
    obj = required_group(db, group_id)
    for key, value in data.model_dump().items():
        setattr(obj, key, value)
    commit_or_conflict(db, 'Группа с таким названием уже существует')
    db.refresh(obj)
    return obj

#удалить только если все студенты куда-то переведены (группа пустая), иначе - 409
@app.delete('/groups/{group_id}', status_code=204)
def delete_group(group_id: int, db: DB):
    obj = required_group(db, group_id)
    if db.scalar(select(func.count(Student.id)).where(Student.group_id == group_id)):
        raise HTTPException(409, 'Сначала переведите или удалите студентов группы')
    db.delete(obj)
    db.commit()

#состав группы (Ф+И)
@app.get('/groups/{group_id}/students', response_model=list[StudentOut])
def group_students(group_id: int, db: DB):
    required_group(db, group_id)
    return db.scalars(select(Student).where(Student.group_id == group_id).order_by(Student.last_name, Student.first_name)).all()

#список+фильтры
@app.get('/students', response_model=list[StudentOut])
def list_students(db: DB, last_name: str | None = None, group_id: int | None = None, course: int | None = Query(default=None, ge=1, le=6)):
    stmt = select(Student).join(Group)
    if last_name:
        stmt = stmt.where(Student.last_name.ilike(f'%{last_name}%'))
    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)
    if course is not None:
        stmt = stmt.where(Group.course == course)
    return db.scalars(stmt.order_by(Student.last_name, Student.first_name)).all()

#создать группа должна существовать
@app.post('/students', response_model=StudentOut, status_code=201)
def create_student(data: StudentIn, db: DB):
    required_group(db, data.group_id)
    obj = Student(**data.model_dump())
    db.add(obj)
    commit_or_conflict(db, 'Студент с таким email уже существует')
    db.refresh(obj)
    return obj

#один студент
@app.get('/students/{student_id}', response_model=StudentOut)
def get_student(student_id: int, db: DB):
    return required_student(db, student_id)

#правка/перевод смена id группы для студента
@app.put('/students/{student_id}', response_model=StudentOut)
def update_student(student_id: int, data: StudentIn, db: DB):
    obj = required_student(db, student_id)
    required_group(db, data.group_id)
    for key, value in data.model_dump().items():
        setattr(obj, key, value)
    commit_or_conflict(db, 'Студент с таким email уже существует')
    db.refresh(obj)
    return obj

#удалить - 204
@app.delete('/students/{student_id}', status_code=204)
def delete_student(student_id: int, db: DB):
    db.delete(required_student(db, student_id))
    db.commit()

#outerjoin - группы без студентов тоже в статистике но со счетчиком студентов = 0.
@app.get('/statistics/group-counts', response_model=list[GroupCount])
def group_counts(db: DB):
    stmt = select(Group.id, Group.name, func.count(Student.id)).outerjoin(Student).group_by(Group.id, Group.name).order_by(Group.name)
    return [GroupCount(group_id=id, group_name=name, student_count=count) for id, name, count in db.execute(stmt).all()]
