import { useEffect, useRef, useState } from 'react';

export function useSnakePlotTooltip() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [fillColor, setFillColor] = useState('#B7B7EB');
  const [textColor, setTextColor] = useState('#000000');

  function initSnakeplotTooltips(svg: SVGElement | null) {
    if (!svg) return;
    let tooltip = document.getElementById('snake-tooltip') as HTMLDivElement;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'snake-tooltip';
      tooltip.classList.add(
        'snake-tooltip',
        'pointer-events-none',
        'bg-white',
        'dark:bg-black',
        'dark:text-white',
        'text-xs',
        'sm:text-sm',
        'rounded',
        'border',
        'border-gray-300',
        'px-1',
        'py-0.5',
        'sm:px-2',
        'sm:py-1',
        'fixed',
        'opacity-0',
        'z-40',
        'max-w-xs',
        'sm:max-w-sm',
        'break-words',
        'leading-tight',
        'sm:leading-normal'
      );
      document.body.appendChild(tooltip);
      tooltipRef.current = tooltip;
      
      // Set initial positioning
      tooltip.style.left = '0px';
      tooltip.style.top = '0px';
      tooltip.style.transform = '';
    }
    svg.removeEventListener('mouseover', handleMouseOver);
    svg.removeEventListener('mousemove', handleMouseMove);
    svg.removeEventListener('mouseout', handleMouseOut);
    function handleMouseOver(e: Event) {
      const target = e.target as Element;
      const tooltipText =
        target.getAttribute('data-snake-tooltip') ||
        target.getAttribute('data-original-title') ||
        target.getAttribute('title');

      if (tooltipText) {
        tooltip.innerHTML = tooltipText;
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
      }
    }

    function handleMouseMove(e: Event) {
      const mouseEvent = e as MouseEvent;
      const target = mouseEvent.target as Element;

      if (
        target.getAttribute('title') ||
        target.getAttribute('data-snake-tooltip') ||
        target.getAttribute('data-original-title')
      ) {
        const tooltipWidth = 200; // Estimated tooltip width
        const tooltipHeight = 120; // Estimated tooltip height
        
        // Use clientX/clientY for viewport-relative positioning
        const x = Math.min(mouseEvent.clientX + 12, window.innerWidth - tooltipWidth);
        const y = Math.min(Math.max(mouseEvent.clientY + 12, 10), window.innerHeight - tooltipHeight);
        
        // Update tooltip to use fixed positioning
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.style.transform = '';
      }
    }

    function handleMouseOut(e: Event) {
      const target = e.target as Element;
      const relatedTarget = (e as MouseEvent).relatedTarget as Element;
      if (
        (target.getAttribute('title') ||
          target.getAttribute('data-snake-tooltip') ||
          target.getAttribute('data-original-title')) &&
        (!relatedTarget || !relatedTarget.getAttribute('title'))
      ) {
        tooltip.style.opacity = '0';
        tooltip.style.display = 'none';
      }
    }
    svg.addEventListener('mouseover', handleMouseOver);
    svg.addEventListener('mousemove', handleMouseMove);
    svg.addEventListener('mouseout', handleMouseOut);
  }

  async function updateSnakeplotConservation(conservationFilePath: string) {
    if (!conservationFilePath) {
      console.warn('No conservation file specified.');
      return;
    }

    try {
      const response = await fetch(conservationFilePath);
      const text = await response.text();
      const lines = text
        .split(/\r?\n/)
        .filter(line => line.trim() !== '' && !line.toLowerCase().startsWith('residue'));

      interface ConservationData {
        conservation: number;
        conservedAA: string;
        humanAA: string;
        region: string;
        gpcrdb: string;
      }

      const conservationMap: Record<string, ConservationData> = {};

      lines.forEach(line => {
        const parts = line.trim().split(/\t/);
        if (parts.length >= 6) {
          const residue = parts[0];
          const consValue = parseFloat(parts[1]);
          const conservedAA = parts[2] || '';
          const humanAA = parts[3] || '';
          const region = parts[4] || '';
          const gpcrdb = parts[5] || '';

          if (!isNaN(consValue)) {
            conservationMap[residue] = {
              conservation: consValue,
              conservedAA,
              humanAA,
              region,
              gpcrdb,
            };
          }
        }
      });

      const elem = document.getElementById('snakeplot');
      if (!(elem instanceof SVGElement)) {
        console.error('Snakeplot SVG not found or is not an SVGElement.');
        return;
      }
      const svg = elem;

      // Ensure container and svg inherit theme background
      const containerDiv = svg.parentElement as HTMLElement | null;
      containerDiv?.removeAttribute('style');
      containerDiv?.classList.add('bg-background');
      svg.removeAttribute('style');

      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      } else {
        while (defs.firstChild) {
          defs.removeChild(defs.firstChild);
        }
      }

      function getGradientOffset(consValue: number) {
        const p = consValue / 100;
        const A_target = p * Math.PI;

        function segmentArea(h: number) {
          return Math.acos(1 - h) - (1 - h) * Math.sqrt(2 * h - h * h);
        }

        let low = 0,
          high = 2,
          mid = 0,
          A_mid;
        for (let i = 0; i < 20; i++) {
          mid = (low + high) / 2;
          A_mid = segmentArea(mid);
          if (A_mid < A_target) {
            low = mid;
          } else {
            high = mid;
          }
        }
        const offset = ((2 - mid) / 2) * 100;
        return offset + '%';
      }

      const circles = svg.querySelectorAll('circle.rcircle');
      circles.forEach(circle => {
        const residueId = circle.getAttribute('id');
        if (!residueId) return;

        const consData = conservationMap[residueId];
        if (!consData) return;

        const consValue = consData.conservation;
        const boundary = getGradientOffset(consValue);
        const gradId = 'grad-' + residueId;

        const linearGradient = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'linearGradient'
        );
        linearGradient.setAttribute('id', gradId);
        linearGradient.setAttribute('x1', '0%');
        linearGradient.setAttribute('y1', '0%');
        linearGradient.setAttribute('x2', '0%');
        linearGradient.setAttribute('y2', '100%');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', 'white');
        linearGradient.appendChild(stop1);

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', boundary);
        stop2.setAttribute('stop-color', 'white');
        linearGradient.appendChild(stop2);

        const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop3.setAttribute('offset', boundary);
        stop3.setAttribute('stop-color', fillColor);
        linearGradient.appendChild(stop3);

        const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop4.setAttribute('offset', '100%');
        stop4.setAttribute('stop-color', fillColor);
        linearGradient.appendChild(stop4);

        defs.appendChild(linearGradient);

        circle.setAttribute('fill', 'url(#' + gradId + ')');
        circle.setAttribute('data-conservation', String(consValue));

        const tooltipHTML = `
          <strong>Residue #:</strong> ${residueId}<br/>
          <strong>Conservation %:</strong> ${consValue}%<br/>
          <strong>Conserved AA:</strong> ${consData.conservedAA}<br/>
          <strong>Human AA:</strong> ${consData.humanAA}<br/>
          <strong>Region:</strong> ${consData.region}<br/>
          <strong>GPCRdb #:</strong> ${consData.gpcrdb}
        `;

        circle.removeAttribute('original_title');
        circle.removeAttribute('data-original-title');
        circle.removeAttribute('data-snake-tooltip');
        circle.setAttribute('title', tooltipHTML);
      });

      const textElements = svg.querySelectorAll('text.rtext');

      textElements.forEach(txt => {
        const originalTitle = txt.getAttribute('original_title');
        if (!originalTitle) return;

        const residueMatch = originalTitle.match(/\d+/);
        if (!residueMatch) return;

        const residueId = residueMatch[0];
        const consData = conservationMap[residueId];
        if (!consData) return;

        const consValue = consData.conservation;
        const tooltipHTML = `
          <div class="tooltip-content">
            <div><strong>Residue #:</strong> ${residueId}</div>
            <div><strong>Conservation %:</strong> ${consValue}%</div>
            <div><strong>Conserved AA:</strong> ${consData.conservedAA}</div>
            <div><strong>Human AA:</strong> ${consData.humanAA}</div>
            <div><strong>Region:</strong> ${consData.region}</div>
            <div><strong>GPCRdb #:</strong> ${consData.gpcrdb}</div>
          </div>
        `;

        txt.setAttribute('data-snake-tooltip', tooltipHTML);
        txt.setAttribute('data-conservation', String(consValue));
        txt.setAttribute('style', 'fill: ' + textColor + ';');
      });

      initSnakeplotTooltips(svg);
    } catch (error) {
      console.error('Conservation verilerini işlerken hata:', error);
    }
  }

  useEffect(() => {
    let isMounted = true;
    let timeout: NodeJS.Timeout | null = null;

    const observer = new MutationObserver(mutations => {
      mutations.forEach(() => {
        const elem = document.getElementById('snakeplot');
        if (elem instanceof SVGElement && isMounted) {
          observer.disconnect();
          initSnakeplotTooltips(elem);
        }
      });
    });

    const elem = document.getElementById('snakeplot');
    if (elem instanceof SVGElement) {
      initSnakeplotTooltips(elem);
    } else {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      timeout = setTimeout(() => {
        const elem = document.getElementById('snakeplot');
        if (elem instanceof SVGElement && isMounted) {
          observer.disconnect();
          initSnakeplotTooltips(elem);
        }
      }, 1000);
    }

    return () => {
      isMounted = false;
      observer.disconnect();
      if (timeout) clearTimeout(timeout);
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current);
      }
    };
  }, []);

  return {
    initSnakeplotTooltips,
    updateSnakeplotConservation,
    fillColor,
    setFillColor,
    textColor,
    setTextColor,
  };
}
