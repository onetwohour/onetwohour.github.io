document.addEventListener('DOMContentLoaded', function() {
    const buttonContainers = document.querySelectorAll('.button-container');

    buttonContainers.forEach(function(buttonContainer) {
        buttonContainer.addEventListener('touchmove', handleMove);
        buttonContainer.addEventListener('mousemove', handleMove);
    });

    function handleMove(event) {
        const isMobile = event.type === 'touchmove';
        const pointerEvent = isMobile ? event.changedTouches[0] : event;
        const rect = event.currentTarget.getBoundingClientRect();

        const mouseX = (pointerEvent.clientX - rect.left) / rect.width * 100;
        const mouseY = (pointerEvent.clientY - rect.top) / rect.height * 100;

        event.currentTarget.style.setProperty('--gradient-x', mouseX + '%');
        event.currentTarget.style.setProperty('--gradient-y', mouseY + '%');
        }
    }
); 