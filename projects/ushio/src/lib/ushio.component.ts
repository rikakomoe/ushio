import {
  AfterContentInit,
  AfterViewInit,
  Component,
  ContentChildren,
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { fromEvent, merge, NEVER, of, Subject, Subscription, timer } from 'rxjs';
import { concatMap, distinctUntilChanged, map, mapTo, switchMap, takeUntil } from 'rxjs/operators';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';

@Directive({
  // tslint:disable-next-line:directive-selector
  selector: 'ushio-subtitles'
})
// tslint:disable-next-line:directive-class-suffix
export class UshioSubtitles {
  @Input() value !: string;
}

@Component({
  selector: 'ushio-player',
  templateUrl: './ushio.component.html',
  styleUrls: ['./ushio.component.styl'],
  encapsulation: ViewEncapsulation.ShadowDom
})
export class UshioComponent implements OnInit, AfterContentInit, AfterViewInit, OnDestroy {

  @Input() src;
  @Input() poster;
  @Input() crossorigin;
  @Input() autoplay;
  @Input() preload = 'metadata';
  @Input() loop;
  @Input() muted;
  @Input() set volume(volume) {
    this.video.nativeElement.volume = volume / 100;
  }
  get volume() {
    return Math.round(this.mVolume * 100);
  }
  @Input() volumeControl = true;
  @Input() loopControl = true;
  @Input() fullscreenControl = true;
  @Input() subtitlesControl = true;

  private mVolume = 1;

  @ViewChild('video', {static: true}) video;
  @ViewChild('sliderTrack', {static: true}) sliderTrack;
  @ViewChild('volumeBarTrack', {static: true}) volumeBarTrack;
  @ViewChild('volumeBarWrap', {static: true}) volumeBarWrap;
  @ViewChild('volumeBtn', {static: true}) volumeBtn;

  @ContentChildren(UshioSubtitles) subtitles!: QueryList<UshioSubtitles>;
  private subtitlesSlot$ = new Subject<HTMLElement[]>();

  private hover = false;
  private thumbMouseDown = false;
  private volumeMouseDown = false;
  controlHoveredClass = '';
  get isFullScreen(): boolean {
    return document.fullscreenElement !== null;
  }
  get mouseDown(): boolean {
    return this.thumbMouseDown || this.volumeMouseDown;
  }
  get hoverClass(): string {
    return (this.hover || this.controlHoveredClass || this.mouseDown) ? ' mouse-hover' : '';
  }
  get noCursorClass(): string {
    return !(this.hover || this.controlHoveredClass || this.mouseDown) ? ' no-cursor' : '';
  }
  get thumbMouseDownClass(): string {
    return this.thumbMouseDown ? ' thumb-mouse-down' : '';
  }
  get pausedClass(): string {
    return this.video.nativeElement.paused ? ' video-state-pause' : ' video-state-play';
  }
  get pendingClass(): string {
    return this.pending && !this.video.nativeElement.paused ? ' video-state-pending' : '';
  }
  get mutedClass(): string {
    return (this.video.nativeElement.muted || this.video.nativeElement.volume === 0)
      ? ' video-state-muted' : ' video-state-volume';
  }
  get repeatClass(): string {
    return this.video.nativeElement.loop ? ' video-state-repeat' : ' video-state-norepeat';
  }
  get fullscreenClass(): string {
    return this.isFullScreen ? ' video-state-fullscreen' : ' video-state-nofullscreen';
  }
  private currentTime = 0;
  private duration = 0;
  private bufferedTime = 0;
  private pending = false;
  get currentTimeStr(): string {
    return this.formatDuration(this.currentTime);
  }
  get durationStr(): string {
    return this.formatDuration(this.duration);
  }
  get bufferedProgress(): SafeStyle {
    return this.sanitization.bypassSecurityTrustStyle(
      `transform: scaleX(${this.bufferedTime / this.duration})`
    );
  }
  get playedProgress(): SafeStyle {
    return this.sanitization.bypassSecurityTrustStyle(
      `transform: scaleX(${this.currentTime / this.duration})`
    );
  }
  get thumbPosition(): SafeStyle {
    return this.sanitization.bypassSecurityTrustStyle(
      `left: ${this.currentTime / this.duration * 100}%`
    );
  }
  get volumeRate(): SafeStyle {
    return this.sanitization.bypassSecurityTrustStyle(
      `transform: scaleY(${this.mVolume})`
    );
  }
  get volumeThumbPosition(): SafeStyle {
    return this.sanitization.bypassSecurityTrustStyle(
      `bottom: ${this.volume}%`
    );
  }

  private timeUpdate: Subscription;
  private volumeChange: Subscription;
  private controlHoveredChange: Subscription;
  private subscriptions: Subscription[] = [];

  constructor(
    private element: ElementRef,
    private sanitization: DomSanitizer
  ) { }

  ngOnInit() {
    this.mVolume = this.video.nativeElement.volume;
  }

  ngAfterContentInit() {
    const subtitles$ = merge(
      of(this.subtitles.map(item => item.value)),
      this.subtitles.changes.pipe(
        map(subtitles => (
          subtitles.toArray().filter(s => s.value).map(s => s.value)
        ))
      ),
      this.subtitlesSlot$.pipe(
        map(subtitles => (
          subtitles.filter(s => s.getAttribute('value'))
            .map(s => s.getAttribute('value'))
        ))
      )
    );
    this.subscriptions.push(subtitles$.subscribe((subtitles) => {
      console.log(subtitles);
    }));
  }

  ngAfterViewInit() {
    const mouseMove$ = fromEvent(document, 'mousemove');
    const mouseUp$ = fromEvent(document, 'mouseup');
    const mouseInArea = (e: MouseEvent, btnElement, popUpElement) => {
      const rect1 = popUpElement.getBoundingClientRect();
      const rect2 = btnElement.getBoundingClientRect();
      return (e.clientX > rect1.left &&
        e.clientX < rect1.right &&
        e.clientY > rect1.top &&
        e.clientY < rect1.bottom) || (e.clientX > rect2.left &&
        e.clientX < rect2.right &&
        e.clientY > rect2.top &&
        e.clientY < rect2.bottom);
    };
    interface PopUpBtn {
      btnElement: HTMLElement;
      popUpElement: HTMLElement;
      btnName: string;
    }
    const onControlBtnHoverStateChanged$ = (btns: PopUpBtn[]) => {
      return mouseMove$.pipe(
        switchMap((e: MouseEvent) => {
          for (const btn of btns) {
            if (mouseInArea(e, btn.btnElement, btn.popUpElement)) {
              return of(` btn-${btn.btnName}-hover`);
            }
          }
          return timer(150).pipe(
            mapTo('')
          );
        }),
        distinctUntilChanged()
      );
    };
    const hoverStateChanged$ = mouseMove$.pipe(
      switchMap((e: MouseEvent) => {
        const rect = this.video.nativeElement.getBoundingClientRect();
        return e.clientX > rect.left &&
        e.clientX < rect.right &&
        e.clientY > rect.top &&
        e.clientY < rect.bottom
          ? merge(
            of(true),
            e.clientY < rect.bottom - 46 ? timer(750).pipe(
              mapTo(false)
            ) : NEVER
          )
          : of(false);
      }),
      distinctUntilChanged()
    );
    this.subscriptions.push(hoverStateChanged$.subscribe(state => {
      this.hover = state;
    }));
    this.timeUpdate = fromEvent(this.video.nativeElement, 'timeupdate').subscribe(() => {
      this.currentTime = this.video.nativeElement.currentTime;
    });
    this.subscriptions.push(fromEvent(this.video.nativeElement, 'waiting').subscribe(() => {
      this.pending = true;
    }));
    this.subscriptions.push(fromEvent(this.video.nativeElement, 'playing').subscribe(() => {
      this.pending = false;
    }));
    this.subscriptions.push(fromEvent(this.video.nativeElement, 'progress').subscribe(() => {
      this.bufferedTime = ((timeRanges, currentTime) => {
        const length = timeRanges.length;
        for (let i = 0; i < length; i++) {
          if (timeRanges.end(i) <= currentTime) {
            continue;
          }
          if (timeRanges.start(i) <= currentTime) {
            return timeRanges.end(i);
          }
          return currentTime;
        }
        return currentTime;
      })(this.video.nativeElement.buffered, this.video.nativeElement.currentTime);
    }));
    this.subscriptions.push(fromEvent(this.video.nativeElement, 'loadedmetadata').subscribe(() => {
      this.duration = this.video.nativeElement.duration;
    }));
    this.video.nativeElement.volume = this.mVolume;
    this.volumeChange = fromEvent(this.video.nativeElement, 'volumechange').subscribe(() => {
      this.mVolume = this.video.nativeElement.volume;
    });
    const mapToRate = (element, progress, total) => map((moveEvent: MouseEvent) => {
        const rect = element.getBoundingClientRect();
        let p = progress(moveEvent, rect);
        const t = total(rect);
        if (p < 0) {
          p = 0;
        } else if (p > t) {
          p = t;
        }
        return p / t;
      }
    );
    const onMouseDown$ = (element, progress, total) => {
      return fromEvent(element, 'mousedown').pipe(
        mapToRate(element, progress, total)
      );
    };
    const onMouseDrag$ = (mouseDown$, element, progress, total) => {
      return mouseDown$.pipe(
        concatMap(() => {
          return mouseMove$.pipe(
            takeUntil(mouseUp$),
            mapToRate(element, progress, total)
          );
        })
      );
    };
    const thumbMouseDown$ = onMouseDown$(
      this.sliderTrack.nativeElement,
      (moveEvent, rect) => (moveEvent.x - rect.left),
      (rect) => (rect.width)
    );
    const thumbDrag$ = onMouseDrag$(
      thumbMouseDown$,
      this.sliderTrack.nativeElement,
      (moveEvent, rect) => (moveEvent.x - rect.left),
      (rect) => (rect.width)
    );
    this.subscriptions.push(thumbMouseDown$.subscribe(e => {
      this.thumbMouseDown = true;
      this.timeUpdate.unsubscribe();
      this.currentTime = e * this.duration;
    }));
    this.subscriptions.push(thumbDrag$.subscribe(e => {
      this.currentTime = e * this.duration;
    }));
    this.subscriptions.push(mouseUp$.subscribe(() => {
      if (this.thumbMouseDown) {
        this.video.nativeElement.currentTime = this.currentTime;
        this.timeUpdate = fromEvent(this.video.nativeElement, 'timeupdate').subscribe(() => {
          this.currentTime = this.video.nativeElement.currentTime;
        });
        this.thumbMouseDown = false;
      }
    }));
    const controlHoverStateChanged$ = onControlBtnHoverStateChanged$([{
      btnElement: this.volumeBtn.nativeElement,
      popUpElement: this.volumeBarWrap.nativeElement,
      btnName: 'volume',
    }]);
    this.controlHoveredChange = controlHoverStateChanged$.subscribe(e => {
      this.controlHoveredClass = e;
    });
    const volumeMouseDown$ = onMouseDown$(
      this.volumeBarTrack.nativeElement,
      (moveEvent, rect) => (rect.bottom - moveEvent.y),
      (rect) => (rect.height),
    );
    const volumeDrag$ = onMouseDrag$(
      volumeMouseDown$,
      this.volumeBarTrack.nativeElement,
      (moveEvent, rect) => (rect.bottom - moveEvent.y),
      (rect) => (rect.height),
    );
    this.subscriptions.push(volumeMouseDown$.subscribe(e => {
      this.volumeMouseDown = true;
      this.volumeChange.unsubscribe();
      this.controlHoveredChange.unsubscribe();
      this.mVolume = e;
      this.video.nativeElement.volume = this.mVolume;
    }));
    this.subscriptions.push(volumeDrag$.subscribe(e => {
      this.mVolume = e;
      this.video.nativeElement.volume = this.mVolume;
    }));
    this.subscriptions.push(mouseUp$.subscribe(() => {
      if (this.volumeMouseDown) {
        this.video.nativeElement.volume = this.mVolume;
        this.volumeChange = fromEvent(this.video.nativeElement, 'volumechange').subscribe(() => {
          this.mVolume = this.video.nativeElement.volume;
        });
        this.controlHoveredChange = controlHoverStateChanged$.subscribe(e => {
          this.controlHoveredClass = e;
        });
        this.volumeMouseDown = false;
      }
    }));
  }

  ngOnDestroy() {
    this.timeUpdate.unsubscribe();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onSlotChange(e) {
    this.subtitlesSlot$.next(
      e.target.assignedNodes().filter(node => node.nodeName === 'USHIO-SUBTITLES')
    );
  }

  togglePlay() {
    if (this.video.nativeElement.paused) {
      this.video.nativeElement.play();
    } else {
      this.video.nativeElement.pause();
    }
  }

  toggleMute() {
    this.video.nativeElement.muted = !this.video.nativeElement.muted;
  }

  toggleLoop() {
    this.video.nativeElement.loop = !this.video.nativeElement.loop;
  }

  toggleFullscreen() {
    if (!this.isFullScreen) {
      this.element.nativeElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private formatDuration = (duration: number): string => {
    const h = Math.floor(duration / 3600);
    const m = Math.floor(duration % 3600 / 60);
    const s = Math.floor(duration % 60);
    let str = '';
    if (h && h < 10) { str += `0${h}:`; } else if (h) { str += `${h}:`; }
    if (m < 10) { str += `0${m}:`; } else { str += `${m}:`; }
    if (s < 10) { str += `0${s}`;  } else { str += `${s}`; }
    return str;
  }

}
