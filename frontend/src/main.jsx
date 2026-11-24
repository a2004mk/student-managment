import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const REPORTS = import.meta.env.VITE_REPORTS_URL || 'http://localhost:8001';
async function request(url, options={}) {
  let response;
  try { response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options}); }
  catch { throw Error('Сервис недоступен. Проверьте соединение.'); }
  if (!response.ok) {
    let body = {}; try {body = await response.json();} catch {}
    const detail = body.detail;
    throw Error(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(x=>`${x.loc?.join('.')}: ${x.msg}`).join('; ') : `Ошибка HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}
const emptyGroup = {name:'', specialization:'', course:1};
const emptyStudent = {last_name:'', first_name:'', email:'', group_id:''};
function App(){
  const [tab,setTab]=useState('students');
  const [groups,setGroups]=useState([]), [students,setStudents]=useState([]), [report,setReport]=useState([]);
  const [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [groupForm,setGroupForm]=useState(emptyGroup), [studentForm,setStudentForm]=useState(emptyStudent);
  const [editingGroup,setEditingGroup]=useState(null), [editingStudent,setEditingStudent]=useState(null);
  const [filters,setFilters]=useState({last_name:'',group_id:'',course:''});
  const [selectedGroup,setSelectedGroup]=useState('');
  const load=async()=>{
    try { const [g,s,r]=await Promise.all([request(`${API}/groups`),request(`${API}/students`),request(`${REPORTS}/reports/students-by-group`)]);setGroups(g);setStudents(s);setReport(r);setError(''); }
    catch(e){setError(e.message);}
  };
  useEffect(()=>{load()},[]);
  const run=async(fn,message)=>{try{setError('');setNotice('');await fn();await load();setNotice(message)}catch(e){setError(e.message)}};
  const submitGroup=e=>{e.preventDefault();run(async()=>{await request(`${API}/groups${editingGroup===null?'':`/${editingGroup}`}`,{method:editingGroup===null?'POST':'PUT',body:JSON.stringify({...groupForm,course:Number(groupForm.course)})});setEditingGroup(null);setGroupForm(emptyGroup)},'Группа сохранена')};
  const submitStudent=e=>{e.preventDefault();run(async()=>{await request(`${API}/students${editingStudent===null?'':`/${editingStudent}`}`,{method:editingStudent===null?'POST':'PUT',body:JSON.stringify({...studentForm,group_id:Number(studentForm.group_id)})});setEditingStudent(null);setStudentForm(emptyStudent)},'Студент сохранён')};
  const filtered=students.filter(s=>(!filters.last_name||s.last_name.toLowerCase().includes(filters.last_name.toLowerCase()))&&(!filters.group_id||s.group_id===Number(filters.group_id))&&(!filters.course||groups.find(g=>g.id===s.group_id)?.course===Number(filters.course)));
  return <main><header><div><h1>Управление студентами</h1><p>Учебные группы, студенты и статистика</p></div><button onClick={load}>Обновить</button></header>
    <nav>{[['students','Студенты'],['groups','Группы'],['reports','Отчёт']].map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {error&&<div role="alert" className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
    {tab==='groups'&&<><section><h2>{editingGroup===null?'Новая группа':'Редактировать группу'}</h2><form onSubmit={submitGroup}><input required maxLength="100" placeholder="Название" value={groupForm.name} onChange={e=>setGroupForm({...groupForm,name:e.target.value})}/><input required maxLength="150" placeholder="Направление подготовки" value={groupForm.specialization} onChange={e=>setGroupForm({...groupForm,specialization:e.target.value})}/><label>Курс <input required type="number" min="1" max="6" value={groupForm.course} onChange={e=>setGroupForm({...groupForm,course:e.target.value})}/></label><button type="submit">Сохранить</button>{editingGroup!==null&&<button type="button" onClick={()=>{setEditingGroup(null);setGroupForm(emptyGroup)}}>Отмена</button>}</form></section><section><h2>Учебные группы</h2><div className="table-wrap"><table><thead><tr><th>Название</th><th>Направление</th><th>Курс</th><th>Действия</th></tr></thead><tbody>{groups.map(g=><tr key={g.id}><td><button className="link" onClick={()=>{setSelectedGroup(String(g.id));setTab('students');setFilters({...filters,group_id:String(g.id)})}}>{g.name}</button></td><td>{g.specialization}</td><td>{g.course}</td><td><button onClick={()=>{setEditingGroup(g.id);setGroupForm({name:g.name,specialization:g.specialization,course:g.course})}}>Изменить</button> <button className="danger" onClick={()=>{if(confirm(`Удалить группу ${g.name}?`))run(()=>request(`${API}/groups/${g.id}`,{method:'DELETE'}),'Группа удалена')}}>Удалить</button></td></tr>)}</tbody></table></div></section></>}
    {tab==='students'&&<><section><h2>{editingStudent===null?'Добавить студента':'Редактировать студента'}</h2><form onSubmit={submitStudent}><input required maxLength="100" placeholder="Фамилия" value={studentForm.last_name} onChange={e=>setStudentForm({...studentForm,last_name:e.target.value})}/><input required maxLength="100" placeholder="Имя" value={studentForm.first_name} onChange={e=>setStudentForm({...studentForm,first_name:e.target.value})}/><input required type="email" placeholder="Email" value={studentForm.email} onChange={e=>setStudentForm({...studentForm,email:e.target.value})}/><select required value={studentForm.group_id} onChange={e=>setStudentForm({...studentForm,group_id:e.target.value})}><option value="">Выберите группу</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button type="submit">Сохранить</button>{editingStudent!==null&&<button type="button" onClick={()=>{setEditingStudent(null);setStudentForm(emptyStudent)}}>Отмена</button>}</form></section><section><h2>Поиск и фильтры</h2><div className="filters"><input placeholder="Поиск по фамилии" value={filters.last_name} onChange={e=>setFilters({...filters,last_name:e.target.value})}/><select value={filters.group_id} onChange={e=>{setFilters({...filters,group_id:e.target.value});setSelectedGroup(e.target.value)}}><option value="">Все группы</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><select value={filters.course} onChange={e=>setFilters({...filters,course:e.target.value})}><option value="">Все курсы</option>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n} курс</option>)}</select><button onClick={()=>{setFilters({last_name:'',group_id:'',course:''});setSelectedGroup('')}}>Сбросить</button></div></section><section><h2>{selectedGroup?`Студенты группы ${groups.find(g=>g.id===Number(selectedGroup))?.name||''}`:'Список студентов'} ({filtered.length})</h2><div className="table-wrap"><table><thead><tr><th>Фамилия</th><th>Имя</th><th>Email</th><th>Группа</th><th>Действия</th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td>{s.last_name}</td><td>{s.first_name}</td><td>{s.email}</td><td>{groups.find(g=>g.id===s.group_id)?.name||'—'}</td><td><button onClick={()=>{setEditingStudent(s.id);setStudentForm({last_name:s.last_name,first_name:s.first_name,email:s.email,group_id:String(s.group_id)});window.scrollTo(0,0)}}>Изменить / перевести</button> <button className="danger" onClick={()=>{if(confirm(`Удалить ${s.last_name} ${s.first_name}?`))run(()=>request(`${API}/students/${s.id}`,{method:'DELETE'}),'Студент удалён')}}>Удалить</button></td></tr>)}</tbody></table></div>{!filtered.length&&<p>Студенты не найдены.</p>}</section></>}
    {tab==='reports'&&<section><h2>Количество студентов по группам</h2><div className="table-wrap"><table><thead><tr><th>Группа</th><th>Количество студентов</th></tr></thead><tbody>{report.map(r=><tr key={r.group_id}><td>{r.group_name}</td><td>{r.student_count}</td></tr>)}</tbody></table></div><p>Всего студентов: <strong>{report.reduce((sum,r)=>sum+r.student_count,0)}</strong></p></section>}
    <footer>Основной API: <a href={`${API}/docs`} target="_blank">Swagger</a> · Отчёты: <a href={`${REPORTS}/docs`} target="_blank">Swagger</a></footer>
  </main>
}
createRoot(document.getElementById('root')).render(<App/>);
