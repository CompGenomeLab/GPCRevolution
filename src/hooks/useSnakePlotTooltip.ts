// SVG node'larına tooltip eklemek için custom hook
import { useEffect, useRef } from 'react';

export function useSnakePlotTooltip() {
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // SVG içindeki node'lara tooltip eklemek için yardımcı fonksiyon - optimized for performance
  function initSnakeplotTooltips(svg: SVGElement | null) {
    if (!svg) return;

    // Tooltip <div> elementini oluştur veya mevcut olanı kullan
    let tooltip = document.getElementById('snake-tooltip') as HTMLDivElement;
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'snake-tooltip';
      tooltip.classList.add('snake-tooltip');
      document.body.appendChild(tooltip);
      tooltipRef.current = tooltip;

      // Tooltip stili - CSS olarak bir kerede ayarlanıyor
      const tooltipStyle = `
        position: absolute;
        background-color: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 1000;
        pointer-events: none;
        opacity: 0;
        display: none;
        max-width: 300px;
        font-size: 12px;
      `;
      tooltip.style.cssText = tooltipStyle;
    }

    // Performans için etkinlik temsilcisi (event delegation) kullanımı
    // Bu, her elemana ayrı listener eklemek yerine,
    // SVG'ye tek bir listener ekler ve hangi elemanın üzerinde olduğunu kontrol eder

    // Daha önce eklenmiş event listener'ları kaldır (çoklu init'i önlemek için)
    svg.removeEventListener('mouseover', handleMouseOver);
    svg.removeEventListener('mousemove', handleMouseMove);
    svg.removeEventListener('mouseout', handleMouseOut);

    // Tooltip işleyişi için event delegation elemanları
    function handleMouseOver(e: Event) {
      const target = e.target as Element;
      const tooltipText =
        target.getAttribute('data-snake-tooltip') ||
        target.getAttribute('data-original-title') ||
        target.getAttribute('title');

      if (tooltipText) {
        tooltip.innerHTML = tooltipText;
        tooltip.style.display = 'block';
        // Gecikmeli opacity değişimini kaldırarak performans artırılıyor
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
        // Tooltip pozisyonunu güncelle - transform kullanımı daha performanslı
        const x = mouseEvent.pageX + 12;
        const y = mouseEvent.pageY + 12;
        tooltip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }

    function handleMouseOut(e: Event) {
      const target = e.target as Element;
      const relatedTarget = (e as MouseEvent).relatedTarget as Element;

      // Çıkış yapılan eleman tooltip içeriyorsa ve girilen eleman tooltip değilse
      if (
        (target.getAttribute('title') ||
          target.getAttribute('data-snake-tooltip') ||
          target.getAttribute('data-original-title')) &&
        (!relatedTarget || !relatedTarget.getAttribute('title'))
      ) {
        // Tooltip'i gizle - display:none daha etkili
        tooltip.style.opacity = '0';
        tooltip.style.display = 'none';
      }
    }

    // Event listener'ları bir kez ekle
    svg.addEventListener('mouseover', handleMouseOver);
    svg.addEventListener('mousemove', handleMouseMove);
    svg.addEventListener('mouseout', handleMouseOut);
  }

  // Conservation verilerini alıp SVG'yi güncellemek için fonksiyon
  async function updateSnakeplotConservation(conservationFilePath: string) {
    if (!conservationFilePath) {
      console.warn('No conservation file specified.');
      return;
    }

    try {
      // Conservation verisini al
      const response = await fetch(conservationFilePath);
      const text = await response.text();

      // Conservation verisini işle
      const lines = text
        .split(/\\r?\\n/)
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
        const parts = line.trim().split(/\\s+/);
        if (parts.length >= 2) {
          const residue = parts[0];
          const consValue = parseFloat(parts[1]);
          const conservedAA = parts[2] || '';
          const humanAA = parts[3] || '';
          const region = parts[4] || '';
          const gpcrdb = parts[5] || '';

          conservationMap[residue] = {
            conservation: consValue,
            conservedAA,
            humanAA,
            region,
            gpcrdb,
          };
        }
      });

      console.log('Conservation Map:', conservationMap);

      // SVG elementini bul
      const elem = document.getElementById('snakeplot');
      if (!(elem instanceof SVGElement)) {
        console.error('Snakeplot SVG not found or is not an SVGElement.');
        return;
      }
      const svg = elem;

      // defs elementini hazırla
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      } else {
        while (defs.firstChild) {
          defs.removeChild(defs.firstChild);
        }
      }

      // Renkleri al (varsayılan veya kullanıcı tarafından seçilen)
      const userFillColor = '#B7B7EB'; // Lavender varsayılan
      const userTextColor = '#000000'; // Siyah varsayılan

      // Non-lineer gradient offset hesabı için fonksiyon
      function getGradientOffset(consValue: number) {
        const p = consValue / 100;
        const A_target = p * Math.PI;

        function segmentArea(h: number) {
          return Math.acos(1 - h) - (1 - h) * Math.sqrt(2 * h - h * h);
        }

        let low = 0,
          high = 2,
          mid,
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

        const offset = ((2 - (low + high) / 2) / 2) * 100;
        return offset + '%';
      }

      // Daire elementlerini güncelle
      const circles = svg.querySelectorAll('circle.rcircle');
      circles.forEach(circle => {
        const residueId = circle.getAttribute('id');
        if (!residueId) return;

        const consData = conservationMap[residueId];
        if (!consData) return;

        const consValue = consData.conservation;
        const boundary = getGradientOffset(consValue);
        const gradId = 'grad-' + residueId;

        // Gradient oluştur
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
        stop3.setAttribute('stop-color', userFillColor);
        linearGradient.appendChild(stop3);

        const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop4.setAttribute('offset', '100%');
        stop4.setAttribute('stop-color', userFillColor);
        linearGradient.appendChild(stop4);

        defs.appendChild(linearGradient);

        // Daire özelliklerini güncelle
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

      // Text elementlerini güncelle - performans optimizasyonu
      const textElements = svg.querySelectorAll('text.rtext');

      textElements.forEach(txt => {
        const originalTitle = txt.getAttribute('original_title');
        if (!originalTitle) return;

        const residueMatch = originalTitle.match(/\\d+/);
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

        // data attribute olarak daha minimal bilgi saklama
        txt.setAttribute('data-snake-tooltip', tooltipHTML);
        txt.setAttribute('data-conservation', String(consValue));
        txt.setAttribute('style', 'fill: ' + userTextColor + ';');
      });

      // Tooltip'leri başlat - sadece bir kez
      initSnakeplotTooltips(svg);
    } catch (error) {
      console.error('Conservation verilerini işlerken hata:', error);
    }
  }

  // SVG yüklendiğinde tooltip'leri eklemek için useEffect - optimize edilmiş
  useEffect(() => {
    // SVG'nin yüklendiğini kontrol etmek için değişken
    let isMounted = true;
    let timeout: NodeJS.Timeout | null = null;

    // Bu şekilde, sürekli kontrol etmek yerine MutationObserver kullanabilirsiniz
    const observer = new MutationObserver(mutations => {
      mutations.forEach(() => {
        const elem = document.getElementById('snakeplot');
        if (elem instanceof SVGElement && isMounted) {
          observer.disconnect(); // Gözlemlemeyi durdur
          initSnakeplotTooltips(elem);
        }
      });
    });

    // İlk yüklemenin kontrolü
    const elem = document.getElementById('snakeplot');
    if (elem instanceof SVGElement) {
      initSnakeplotTooltips(elem);
    } else {
      // SVG henüz yüklenmemişse, DOM'daki değişiklikleri gözlemle
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Yedek olarak 1 saniye sonra tekrar kontrol et
      timeout = setTimeout(() => {
        const elem = document.getElementById('snakeplot');
        if (elem instanceof SVGElement && isMounted) {
          observer.disconnect();
          initSnakeplotTooltips(elem);
        }
      }, 1000);
    }

    // Temizlik fonksiyonu
    return () => {
      isMounted = false;
      observer.disconnect();
      if (timeout) clearTimeout(timeout);
      if (tooltipRef.current) {
        document.body.removeChild(tooltipRef.current);
      }
    };
  }, []);

  return { initSnakeplotTooltips, updateSnakeplotConservation };
}
