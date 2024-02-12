document.addEventListener('DOMContentLoaded', function() {
    const buttonContainers = document.querySelectorAll('.button-container');

    buttonContainers.forEach(function(buttonContainer) {
        buttonContainer.addEventListener("contextmenu", function(event) {
            event.preventDefault();
        });
        buttonContainer.addEventListener('mousemove', handleMove);
        buttonContainer.addEventListener('mouseenter', handleMove);
    });

    function handleMove(event) {
        const rect = event.currentTarget.getBoundingClientRect();

        const mouseX = (event.clientX - rect.left) / rect.width * 100;
        const mouseY = (event.clientY - rect.top) / rect.height * 100;
        event.currentTarget.style.setProperty('--isMobile', 0);
        event.currentTarget.style.setProperty('--gradient-x', mouseX + '%');
        event.currentTarget.style.setProperty('--gradient-y', mouseY + '%');    
    }
    
    function handleEnd(event) {
        buttonContainers.forEach(function(buttonContainer) {
            buttonContainer.classList.remove('hover');
        })
    }

    document.addEventListener('touchstart', wrapper);
    document.addEventListener('touchmove', wrapper);
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);
    document.addEventListener('touchenter', wrapper);
    
    function wrapper(event) {
        const pos = event.touches[0];
        buttonContainers.forEach(function(buttonContainer) {
            const rect = buttonContainer.getBoundingClientRect();
            const mouseX = (pos.clientX - rect.left) / rect.width * 100;
            const mouseY = (pos.clientY - rect.top) / rect.height * 100;
            buttonContainer.style.setProperty('--isMobile', 1);
            buttonContainer.style.setProperty('--gradient-x', mouseX + '%');
            buttonContainer.style.setProperty('--gradient-y', mouseY + '%');

            if (mouseX >= 0.0 && mouseX <= 100.0 && mouseY >= 0.0 && mouseY <= 100.0) {
                buttonContainer.classList.add('hover');
            } else {
                buttonContainer.classList.remove('hover');
            }
        })
    }
}); 
