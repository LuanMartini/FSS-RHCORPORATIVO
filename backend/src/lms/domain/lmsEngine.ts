import type{CourseDependencyState,QuizAnswer,QuizQuestionKey,WatchState,WatchSyncInput,WatchSyncResult}from'./types.js';
const round=(value:number,scale=3)=>Number(value.toFixed(scale));const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const businessError=(message:string,code:string,status=422):Error=>Object.assign(new Error(message),{code,status});

export function validateWatchSync(state:WatchState,input:WatchSyncInput,minimumPercent=90):WatchSyncResult{
  if(![state.lastSecond,state.maxSecond,state.validSeconds,state.durationSeconds,input.currentSecond,input.reportedDelta].every(Number.isFinite)||state.durationSeconds<=0)throw businessError('Estado de video invalido.','INVALID_VIDEO_STATE',400);
  if(input.currentSecond<0||input.currentSecond>state.durationSeconds+1)throw businessError('Posicao fora da duracao do video.','VIDEO_POSITION_OUT_OF_RANGE');
  if(input.reportedDelta<0||input.reportedDelta>7.5)throw businessError('Janela de sincronizacao invalida.','INVALID_WATCH_DELTA');
  const movement=Math.max(0,input.currentSecond-state.lastSecond);const allowedAdvance=state.maxSecond+input.reportedDelta+1.5;
  if(input.currentSecond>allowedAdvance)throw businessError('Avanco arbitrario detectado. Retorne ao ultimo ponto validado.','VIDEO_SEEK_BLOCKED',409);
  const active=input.active&&input.visibility==='visible';const validDelta=active?round(Math.min(input.reportedDelta,movement+0.75,7.5)):0;
  const maxSecond=active?Math.max(state.maxSecond,Math.min(input.currentSecond,state.durationSeconds)):state.maxSecond;
  const percent=round(clamp(maxSecond/state.durationSeconds*100,0,100),4);
  return{lastSecond:active?Math.min(input.currentSecond,state.durationSeconds):state.lastSecond,maxSecond,validSeconds:round(state.validSeconds+validDelta),durationSeconds:state.durationSeconds,version:state.version+1,percent,completed:percent>=minimumPercent,validDelta};
}

export function gradeQuiz(keys:QuizQuestionKey[],answers:QuizAnswer[],minimumGrade=80):{grade:number;approved:boolean;correct:number;total:number}{
  if(keys.length===0)throw businessError('Tentativa sem questoes.','EMPTY_QUIZ_ATTEMPT',400);const answerMap=new Map(answers.map((answer)=>[answer.questionId,answer.alternativeId]));
  const correct=keys.filter((key)=>answerMap.get(key.questionId)===key.correctAlternativeId).length;const grade=round(correct/keys.length*100,2);return{grade,approved:grade>=minimumGrade,correct,total:keys.length};
}

export function calculateUnlockedCourses(courses:CourseDependencyState[],minimumGrade=80):Map<number,boolean>{
  const byId=new Map(courses.map((course)=>[course.courseId,course]));const unlocked=new Map<number,boolean>();
  for(const course of [...courses].sort((a,b)=>a.order-b.order)){if(course.prerequisiteCourseId===null){unlocked.set(course.courseId,true);continue}const prerequisite=byId.get(course.prerequisiteCourseId);unlocked.set(course.courseId,Boolean(prerequisite&&prerequisite.status==='CONCLUIDO'&&(prerequisite.grade??0)>=minimumGrade));}return unlocked;
}
