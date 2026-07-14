export interface WatchState{lastSecond:number;maxSecond:number;validSeconds:number;durationSeconds:number;version:number}
export interface WatchSyncInput{currentSecond:number;reportedDelta:number;active:boolean;visibility:'visible'|'hidden';sequence:number}
export interface WatchSyncResult extends WatchState{percent:number;completed:boolean;validDelta:number}
export interface QuizQuestionKey{questionId:number;correctAlternativeId:number}
export interface QuizAnswer{questionId:number;alternativeId:number}
export interface CourseDependencyState{courseId:number;order:number;prerequisiteCourseId:number|null;status:string;grade:number|null}
